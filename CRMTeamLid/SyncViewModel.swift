import Foundation
import Combine

struct ManagerOption: Identifiable, Hashable {
    let id: Int
    let name: String
}

@MainActor
final class SyncViewModel: ObservableObject {
    @Published var keepinApiToken = ""
    @Published var rememberToken = false
    @Published var orderDateFrom = Calendar.current.date(byAdding: .day, value: -2, to: Date()) ?? Date()
    @Published var orderDateTo = Date()
    @Published var dataDateFrom = Calendar.current.date(byAdding: .day, value: -2, to: Date()) ?? Date()
    @Published var dataDateTo = Date()
    @Published var selectedManagerIDs: Set<Int> = Set(SyncViewModel.availableManagers.map(\.id))
    @Published var selectedStages: Set<String> = []
    @Published var isLoading = false
    @Published var statusMessage = "Готово до завантаження"
    @Published var lastError = ""
    @Published var summary: AnalyticsSummary?
    @Published var agreements: [CRMAgreement] = []
    @Published var clients: [CRMClient] = []
    private var cancellables = Set<AnyCancellable>()

    init() {
        loadCachedDashboard()

        rememberToken = UserDefaults.standard.bool(forKey: Self.rememberTokenKey)
        if rememberToken {
            keepinApiToken = UserDefaults.standard.string(forKey: Self.savedTokenKey) ?? ""
        }

        $rememberToken
            .dropFirst()
            .sink { isEnabled in
                UserDefaults.standard.set(isEnabled, forKey: Self.rememberTokenKey)
                if isEnabled {
                    UserDefaults.standard.set(self.keepinApiToken, forKey: Self.savedTokenKey)
                } else {
                    self.keepinApiToken = ""
                    UserDefaults.standard.removeObject(forKey: Self.savedTokenKey)
                }
            }
            .store(in: &cancellables)

        $keepinApiToken
            .dropFirst()
            .sink { token in
                guard self.rememberToken else { return }
                UserDefaults.standard.set(token, forKey: Self.savedTokenKey)
            }
            .store(in: &cancellables)

        if rememberToken, !keepinApiToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Task { await loadDashboard() }
        }
    }

    func loadDashboard() async {
        lastError = ""

        guard !keepinApiToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            lastError = "Вкажіть KeepinCRM API token."
            return
        }
        guard !selectedManagerIDs.isEmpty else {
            lastError = "Оберіть хоча б одного менеджера."
            return
        }

        isLoading = true
        statusMessage = "Завантажую дані KeepinCRM..."
        defer { isLoading = false }

        do {
            let agreementsFromDate = min(orderDateFrom, orderDateTo)
            let agreementsToDate = max(orderDateFrom, orderDateTo)
            let agreementsFrom = Self.dateFormatter.string(from: agreementsFromDate)
            let agreementsTo = Self.dateFormatter.string(from: agreementsToDate)
            let keepin = KeepinCRMService(apiToken: keepinApiToken)

            let allAgreements = try await keepin.fetchAllAgreements(from: agreementsFrom, to: agreementsTo) { [weak self] progress in
                Task { @MainActor in
                    self?.statusMessage = progress
                }
            }
            let agreements = allAgreements.filter { agreement in
                guard let managerId = agreement.mainResponsible?.id else { return false }
                return selectedManagerIDs.contains(managerId)
            }
            let clients = Self.uniqueClients(from: agreements)

            self.agreements = agreements.sorted { $0.id > $1.id }
            self.clients = clients.sorted { $0.id > $1.id }
            self.summary = AnalyticsBuilder.build(agreements: agreements, clients: clients)
            normalizeSelectedStages()
            statusMessage = "Аналітика оновлена: \(agreements.count) угод за період \(agreementsFrom) - \(agreementsTo)"
            saveCachedDashboard()
        } catch {
            lastError = error.localizedDescription
            statusMessage = "Оновлення з помилкою"
        }
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let rememberTokenKey = "remember_keepin_token"
    private static let savedTokenKey = "saved_keepin_token"
    static let availableManagers: [ManagerOption] = [
        ManagerOption(id: 13, name: "Рифяк Сільвія"),
        ManagerOption(id: 9, name: "Сулима Ліля"),
        ManagerOption(id: 37, name: "Оксана Ящишин"),
        ManagerOption(id: 12, name: "Кошик Наталія")
    ]

    private static func uniqueClients(from agreements: [CRMAgreement]) -> [CRMClient] {
        var clientsById: [Int: CRMClient] = [:]
        for agreement in agreements {
            if let client = agreement.client, client.id != 0 {
                clientsById[client.id] = client
            }
        }
        return Array(clientsById.values)
    }

    func isManagerSelected(_ managerID: Int) -> Bool {
        selectedManagerIDs.contains(managerID)
    }

    func setManager(_ managerID: Int, isSelected: Bool) {
        if isSelected {
            selectedManagerIDs.insert(managerID)
        } else {
            selectedManagerIDs.remove(managerID)
        }
    }

    var availableStages: [String] {
        Array(Set(agreements.map { ($0.stage?.name ?? "-").trimmingCharacters(in: .whitespacesAndNewlines) }))
            .map { $0.isEmpty ? "-" : $0 }
            .sorted()
    }

    var filteredAgreementsForData: [CRMAgreement] {
        let fromDate = Calendar.current.startOfDay(for: min(dataDateFrom, dataDateTo))
        let toDayStart = Calendar.current.startOfDay(for: max(dataDateFrom, dataDateTo))
        guard let toDate = Calendar.current.date(byAdding: .day, value: 1, to: toDayStart) else {
            return []
        }

        return agreements.filter { agreement in
            let stageName = (agreement.stage?.name ?? "-").trimmingCharacters(in: .whitespacesAndNewlines)
            let normalizedStage = stageName.isEmpty ? "-" : stageName
            let stageAllowed = selectedStages.isEmpty || selectedStages.contains(normalizedStage)
            guard stageAllowed else { return false }

            guard let agreementDate = parseAgreementDate(agreement) else { return true }
            return agreementDate >= fromDate && agreementDate < toDate
        }
    }

    private func loadCachedDashboard() {
        do {
            let data = try Data(contentsOf: Self.cacheURL)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cached = try decoder.decode(CachedDashboard.self, from: data)

            orderDateFrom = cached.orderDateFrom
            orderDateTo = cached.orderDateTo
            dataDateFrom = cached.dataDateFrom
            dataDateTo = cached.dataDateTo
            selectedManagerIDs = Set(cached.selectedManagerIDs)
            selectedStages = Set(cached.selectedStages)
            agreements = cached.agreements.map { $0.toModel() }.sorted { $0.id > $1.id }
            clients = Self.uniqueClients(from: agreements).sorted { $0.id > $1.id }
            summary = AnalyticsBuilder.build(agreements: agreements, clients: clients)
            normalizeSelectedStages()
            statusMessage = "Завантажено збережені дані (\(agreements.count) угод)"
        } catch {
            // No cache yet or cache is invalid - ignore.
        }
    }

    private func saveCachedDashboard() {
        do {
            let payload = CachedDashboard(
                savedAt: Date(),
                agreements: agreements.map(CachedAgreement.init),
                selectedManagerIDs: Array(selectedManagerIDs),
                selectedStages: Array(selectedStages),
                orderDateFrom: orderDateFrom,
                orderDateTo: orderDateTo,
                dataDateFrom: dataDateFrom,
                dataDateTo: dataDateTo
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(payload)

            let folderURL = Self.cacheURL.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: folderURL, withIntermediateDirectories: true)
            try data.write(to: Self.cacheURL, options: .atomic)
        } catch {
            // Cache write failure should not block app flow.
        }
    }

    private static var cacheURL: URL {
        let baseURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return baseURL.appendingPathComponent("CRMTeamLid/dashboard_cache.json")
    }

    private func normalizeSelectedStages() {
        let stages = Set(availableStages)
        if stages.isEmpty {
            selectedStages = []
            return
        }
        if selectedStages.isEmpty {
            selectedStages = stages
            return
        }
        selectedStages = selectedStages.intersection(stages)
        if selectedStages.isEmpty {
            selectedStages = stages
        }
    }

    private func parseAgreementDate(_ agreement: CRMAgreement) -> Date? {
        if let orderedAt = agreement.orderedAt, let date = Self.isoDateFormatter.date(from: orderedAt) {
            return date
        }
        if let createdAt = agreement.createdAt, let date = Self.isoDateFormatter.date(from: createdAt) {
            return date
        }
        return nil
    }

    private static let isoDateFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

private struct CachedDashboard: Codable {
    let savedAt: Date
    let agreements: [CachedAgreement]
    let selectedManagerIDs: [Int]
    let selectedStages: [String]
    let orderDateFrom: Date
    let orderDateTo: Date
    let dataDateFrom: Date
    let dataDateTo: Date
}

private struct CachedAgreement: Codable {
    let id: Int
    let title: String?
    let orderedAt: String?
    let createdAt: String?
    let updatedAt: String?
    let total: Double?
    let result: String?
    let managerId: Int?
    let managerName: String?
    let stageName: String?
    let sourceId: Int?
    let sourceName: String?
    let client: CachedClient?

    init(_ model: CRMAgreement) {
        id = model.id
        title = model.title
        orderedAt = model.orderedAt
        createdAt = model.createdAt
        updatedAt = model.updatedAt
        total = model.total
        result = model.result
        managerId = model.mainResponsible?.id
        managerName = model.mainResponsible?.name
        stageName = model.stage?.name
        sourceId = model.source?.id
        sourceName = model.source?.name
        client = model.client.map(CachedClient.init)
    }

    func toModel() -> CRMAgreement {
        CRMAgreement(
            id: id,
            title: title,
            orderedAt: orderedAt,
            createdAt: createdAt,
            updatedAt: updatedAt,
            total: total,
            result: result,
            mainResponsible: CRMUser(id: managerId, name: managerName),
            stage: CRMAgreementStage(name: stageName),
            source: CRMSource(id: sourceId, name: sourceName),
            client: client?.toModel()
        )
    }
}

private struct CachedClient: Codable {
    let id: Int
    let person: String?
    let company: String?
    let email: String?
    let phones: [String]?
    let lead: Bool?
    let sourceId: Int?
    let sourceName: String?
    let managerId: Int?
    let managerName: String?

    init(_ model: CRMClient) {
        id = model.id
        person = model.person
        company = model.company
        email = model.email
        phones = model.phones
        lead = model.lead
        sourceId = model.source?.id
        sourceName = model.source?.name
        managerId = model.mainResponsible?.id
        managerName = model.mainResponsible?.name
    }

    func toModel() -> CRMClient {
        CRMClient(
            id: id,
            person: person,
            company: company,
            email: email,
            phones: phones,
            lead: lead,
            source: CRMSource(id: sourceId, name: sourceName),
            mainResponsible: CRMUser(id: managerId, name: managerName)
        )
    }
}
