import Foundation
import Combine
import UserNotifications
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

struct ManagerOption: Identifiable, Hashable {
    let id: Int
    let name: String
}

enum AppTheme: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var title: String {
        switch self {
        case .system: return "Системна"
        case .light: return "Світла"
        case .dark: return "Темна"
        }
    }
}

enum AutoSyncInterval: Int, CaseIterable, Identifiable {
    case off = 0
    case minutes15 = 15
    case minutes30 = 30
    case hour1 = 60

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .off: return "Вимкнено"
        case .minutes15: return "Кожні 15 хв"
        case .minutes30: return "Кожні 30 хв"
        case .hour1: return "Кожну 1 годину"
        }
    }
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
    @Published var updateMessage = "Перевірка оновлень не виконувалась"
    @Published var availableUpdate: AppUpdateInfo?
    @Published var isInstallingUpdate = false
    @Published var backgroundImageURL: URL?
    @Published var selectedTheme: AppTheme = .system
    @Published var notificationsEnabled = false
    @Published var notificationSoundURL: URL?
    @Published var autoSyncInterval: AutoSyncInterval = .off
    @Published var refreshOnLaunch = false
    @Published var panelOpacity = 0.92
    @Published var summary: AnalyticsSummary?
    @Published var agreements: [CRMAgreement] = []
    @Published var clients: [CRMClient] = []
    private var cancellables = Set<AnyCancellable>()
    private var autoSyncTask: Task<Void, Never>?

    init() {
        loadCachedDashboard()
        loadBackgroundImage()
        loadSettings()

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

        $selectedTheme
            .dropFirst()
            .sink { value in
                UserDefaults.standard.set(value.rawValue, forKey: Self.themeKey)
            }
            .store(in: &cancellables)

        $refreshOnLaunch
            .dropFirst()
            .sink { value in
                UserDefaults.standard.set(value, forKey: Self.refreshOnLaunchKey)
            }
            .store(in: &cancellables)

        $panelOpacity
            .dropFirst()
            .sink { value in
                UserDefaults.standard.set(value, forKey: Self.panelOpacityKey)
            }
            .store(in: &cancellables)

        $notificationsEnabled
            .dropFirst()
            .sink { [weak self] enabled in
                UserDefaults.standard.set(enabled, forKey: Self.notificationsEnabledKey)
                if enabled {
                    self?.requestNotificationPermission()
                }
            }
            .store(in: &cancellables)

        $autoSyncInterval
            .dropFirst()
            .sink { [weak self] interval in
                UserDefaults.standard.set(interval.rawValue, forKey: Self.autoSyncIntervalKey)
                self?.configureAutoSync()
            }
            .store(in: &cancellables)

        configureAutoSync()

        if refreshOnLaunch, rememberToken, !keepinApiToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            Task { await loadDashboard() }
        }
    }

    deinit {
        autoSyncTask?.cancel()
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
            notifyExchangeFinished(success: true)
        } catch {
            lastError = error.localizedDescription
            statusMessage = "Оновлення з помилкою"
            notifyExchangeFinished(success: false)
        }
    }

    func checkForAppUpdates() async {
        #if os(macOS)
        do {
            let service = BetaUpdateService()
            let release = try await service.fetchLatestRelease(preferBeta: true)
            let currentVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0"
            if service.isNewer(remoteVersion: release.version, currentVersion: currentVersion) {
                availableUpdate = release
                updateMessage = "Доступне оновлення \(release.version) (\(release.isPrerelease ? "beta" : "stable"))"
            } else {
                availableUpdate = nil
                updateMessage = "Оновлень немає. Поточна версія: \(currentVersion)"
            }
        } catch {
            availableUpdate = nil
            updateMessage = "Не вдалося перевірити оновлення: \(error.localizedDescription)"
        }
        #else
        availableUpdate = nil
        updateMessage = "Оновлення додатку доступне лише на macOS."
        #endif
    }

    func installAvailableUpdate() async {
        #if os(macOS)
        guard let update = availableUpdate else { return }
        isInstallingUpdate = true
        defer { isInstallingUpdate = false }

        do {
            let service = BetaUpdateService()
            try await service.install(update: update, over: Bundle.main.bundleURL)
            updateMessage = "Оновлення встановлюється, застосунок перезапуститься..."
            #if os(macOS)
            NSApplication.shared.terminate(nil)
            #endif
        } catch {
            updateMessage = "Не вдалося автооновити: \(error.localizedDescription)"
        }
        #else
        updateMessage = "Автовстановлення доступне лише на macOS."
        #endif
    }

    func chooseBackgroundImage() {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .heic, .heif, .tiff, .gif, .bmp]
        panel.title = "Оберіть фонове зображення"

        guard panel.runModal() == .OK, let sourceURL = panel.url else { return }

        do {
            let savedURL = try persistBackgroundImage(from: sourceURL)
            backgroundImageURL = savedURL
            UserDefaults.standard.set(savedURL.path, forKey: Self.backgroundImagePathKey)
        } catch {
            lastError = "Не вдалося зберегти фон: \(error.localizedDescription)"
        }
        #endif
    }

    func chooseNotificationSound() {
        #if os(macOS)
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.mp3, .wav, .aiff, .midi, .mpeg4Audio]
        panel.title = "Оберіть файл звуку сповіщення"

        guard panel.runModal() == .OK, let sourceURL = panel.url else { return }

        do {
            let savedURL = try persistNotificationSound(from: sourceURL)
            notificationSoundURL = savedURL
            UserDefaults.standard.set(savedURL.path, forKey: Self.notificationSoundPathKey)
        } catch {
            lastError = "Не вдалося зберегти звук: \(error.localizedDescription)"
        }
        #endif
    }

    func clearNotificationSound() {
        if let existingPath = UserDefaults.standard.string(forKey: Self.notificationSoundPathKey) {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: existingPath))
        }
        UserDefaults.standard.removeObject(forKey: Self.notificationSoundPathKey)
        notificationSoundURL = nil
    }

    func clearBackgroundImage() {
        if let existingPath = UserDefaults.standard.string(forKey: Self.backgroundImagePathKey) {
            try? FileManager.default.removeItem(at: URL(fileURLWithPath: existingPath))
        }
        UserDefaults.standard.removeObject(forKey: Self.backgroundImagePathKey)
        backgroundImageURL = nil
    }

    private static let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static let rememberTokenKey = "remember_keepin_token"
    private static let savedTokenKey = "saved_keepin_token"
    private static let backgroundImagePathKey = "saved_background_image_path"
    private static let notificationSoundPathKey = "notification_sound_path"
    private static let themeKey = "app_theme"
    private static let refreshOnLaunchKey = "refresh_on_launch"
    private static let notificationsEnabledKey = "notifications_enabled"
    private static let autoSyncIntervalKey = "auto_sync_interval_minutes"
    private static let panelOpacityKey = "panel_opacity"
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

    private func loadBackgroundImage() {
        guard let path = UserDefaults.standard.string(forKey: Self.backgroundImagePathKey) else { return }
        let url = URL(fileURLWithPath: path)
        if FileManager.default.fileExists(atPath: url.path) {
            backgroundImageURL = url
        } else {
            UserDefaults.standard.removeObject(forKey: Self.backgroundImagePathKey)
        }
    }

    private func loadSettings() {
        if let rawTheme = UserDefaults.standard.string(forKey: Self.themeKey),
           let theme = AppTheme(rawValue: rawTheme) {
            selectedTheme = theme
        } else {
            selectedTheme = .system
        }

        refreshOnLaunch = UserDefaults.standard.bool(forKey: Self.refreshOnLaunchKey)
        notificationsEnabled = UserDefaults.standard.bool(forKey: Self.notificationsEnabledKey)

        let intervalRaw = UserDefaults.standard.integer(forKey: Self.autoSyncIntervalKey)
        autoSyncInterval = AutoSyncInterval(rawValue: intervalRaw) ?? .off
        let savedOpacity = UserDefaults.standard.double(forKey: Self.panelOpacityKey)
        panelOpacity = savedOpacity == 0 ? 0.92 : min(max(savedOpacity, 0.15), 1.0)

        guard let soundPath = UserDefaults.standard.string(forKey: Self.notificationSoundPathKey) else { return }
        let url = URL(fileURLWithPath: soundPath)
        if FileManager.default.fileExists(atPath: url.path) {
            notificationSoundURL = url
        } else {
            UserDefaults.standard.removeObject(forKey: Self.notificationSoundPathKey)
        }
    }

    private func persistBackgroundImage(from sourceURL: URL) throws -> URL {
        #if os(macOS)
        let destinationFolder = Self.cacheURL.deletingLastPathComponent().appendingPathComponent("Background", isDirectory: true)
        try FileManager.default.createDirectory(at: destinationFolder, withIntermediateDirectories: true)

        let ext = sourceURL.pathExtension.isEmpty ? "png" : sourceURL.pathExtension
        let destinationURL = destinationFolder.appendingPathComponent("background.\(ext)")

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)

        return destinationURL
        #else
        throw NSError(domain: "CRMTeamLid", code: -1)
        #endif
    }

    private func persistNotificationSound(from sourceURL: URL) throws -> URL {
        #if os(macOS)
        let destinationFolder = Self.cacheURL.deletingLastPathComponent().appendingPathComponent("Sounds", isDirectory: true)
        try FileManager.default.createDirectory(at: destinationFolder, withIntermediateDirectories: true)

        let ext = sourceURL.pathExtension.isEmpty ? "mp3" : sourceURL.pathExtension
        let destinationURL = destinationFolder.appendingPathComponent("notification.\(ext)")

        if FileManager.default.fileExists(atPath: destinationURL.path) {
            try FileManager.default.removeItem(at: destinationURL)
        }
        try FileManager.default.copyItem(at: sourceURL, to: destinationURL)

        return destinationURL
        #else
        throw NSError(domain: "CRMTeamLid", code: -1)
        #endif
    }

    private func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { _, _ in }
    }

    private func notifyExchangeFinished(success: Bool) {
        guard notificationsEnabled else { return }

        let content = UNMutableNotificationContent()
        content.title = "CRMTeamLid"
        content.body = success ? "Обмін завершено успішно" : "Обмін завершено з помилкою"

        let request = UNNotificationRequest(
            identifier: UUID().uuidString,
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)

        #if os(macOS)
        if let soundURL = notificationSoundURL {
            NSSound(contentsOf: soundURL, byReference: true)?.play()
        }
        #endif
    }

    private func configureAutoSync() {
        autoSyncTask?.cancel()
        guard autoSyncInterval != .off else { return }

        autoSyncTask = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let seconds = UInt64(autoSyncInterval.rawValue * 60) * 1_000_000_000
                try? await Task.sleep(nanoseconds: seconds)
                guard !Task.isCancelled else { return }
                await self.loadDashboard()
            }
        }
    }
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
        if let modelClient = model.client {
            client = CachedClient(modelClient)
        } else {
            client = nil
        }
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
