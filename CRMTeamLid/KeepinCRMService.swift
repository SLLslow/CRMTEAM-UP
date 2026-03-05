import Foundation

enum KeepinCRMError: LocalizedError {
    case badURL
    case badResponse
    case unauthorized
    case rateLimited
    case serverError(code: Int)
    case network(message: String)
    case backend(message: String)

    var errorDescription: String? {
        switch self {
        case .badURL:
            return "Некоректний URL KeepinCRM API."
        case .badResponse:
            return "Невалідна відповідь сервера KeepinCRM."
        case .unauthorized:
            return "Помилка авторизації KeepinCRM. Перевірте API токен."
        case .rateLimited:
            return "Перевищено ліміт запитів KeepinCRM (100/хв). Спробуйте ще раз пізніше."
        case .serverError(let code):
            return "KeepinCRM API повернув помилку: \(code)."
        case .network(let message):
            return message
        case .backend(let message):
            return message
        }
    }
}

struct KeepinCRMService {
    private let baseURL = "https://api.keepincrm.com/v1"
    private let apiToken: String
    private let session: URLSession
    private let decoder: JSONDecoder
    private let backendBaseURL: String

    init(apiToken: String, session: URLSession = .shared, backendBaseURL: String = "https://crmteam-up.onrender.com") {
        self.apiToken = apiToken
        self.session = session
        self.backendBaseURL = backendBaseURL
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
    }

    func fetchDashboardFromBackend(from: String, to: String, managerIDs: [Int]) async throws -> [CRMAgreement] {
        let response: BackendSyncResponse = try await backendRequest(
            path: "/api/data",
            body: SyncRequestBody(
                token: nil,
                dateFrom: from,
                dateTo: to,
                managerIds: managerIDs
            )
        )
        return response.agreements.map { $0.toCRMAgreement() }
    }

    func syncDashboardViaBackend(from: String, to: String, managerIDs: [Int]) async throws -> BackendSyncResponse {
        let tokenValue = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
        return try await backendRequest(
            path: "/api/sync",
            body: SyncRequestBody(
                token: tokenValue.isEmpty ? nil : tokenValue,
                dateFrom: from,
                dateTo: to,
                managerIds: managerIDs
            )
        )
    }

    func fetchLatestSyncLog() async throws -> BackendSyncLogItem? {
        guard let url = URL(string: backendBaseURL + "/api/sync/logs?limit=1") else {
            throw KeepinCRMError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            throw KeepinCRMError.network(message: urlError.localizedDescription)
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw KeepinCRMError.badResponse
        }
        guard httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 else {
            throw KeepinCRMError.serverError(code: httpResponse.statusCode)
        }

        let payload = try JSONDecoder().decode(BackendSyncLogsResponse.self, from: data)
        return payload.items.first
    }

    func fetchAllAgreements(from: String, to: String, progress: @escaping (String) -> Void) async throws -> [CRMAgreement] {
        var currentPage = 1
        var hasNextPage = true
        var allItems: [CRMAgreement] = []

        while hasNextPage {
            let query = [
                URLQueryItem(name: "q[ordered_at_gteq]", value: from),
                URLQueryItem(name: "q[ordered_at_lteq]", value: to),
                URLQueryItem(name: "page", value: "\(currentPage)")
            ]
            let response: PaginatedResponse<CRMAgreement> = try await request(path: "/agreements", queryItems: query)
            allItems.append(contentsOf: response.items)

            let totalPages = response.pagination?.totalPages ?? currentPage
            progress("Угоди: сторінка \(currentPage) / \(totalPages)")
            hasNextPage = currentPage < totalPages
            currentPage += 1
        }

        return allItems
    }

    func fetchAllClients(from: String, to: String, progress: @escaping (String) -> Void) async throws -> [CRMClient] {
        var currentPage = 1
        var hasNextPage = true
        var allItems: [CRMClient] = []

        while hasNextPage {
            let query = [
                URLQueryItem(name: "q[registered_at_gteq]", value: from),
                URLQueryItem(name: "q[registered_at_lteq]", value: to),
                URLQueryItem(name: "page", value: "\(currentPage)")
            ]
            let response: PaginatedResponse<CRMClient> = try await request(path: "/clients", queryItems: query)
            allItems.append(contentsOf: response.items)

            let totalPages = response.pagination?.totalPages ?? currentPage
            progress("Клієнти: сторінка \(currentPage) / \(totalPages)")
            hasNextPage = currentPage < totalPages
            currentPage += 1
        }

        return allItems
    }

    private func request<Response: Decodable>(path: String, queryItems: [URLQueryItem]) async throws -> Response {
        guard var components = URLComponents(string: baseURL + path) else {
            throw KeepinCRMError.badURL
        }
        components.queryItems = queryItems
        guard let url = components.url else {
            throw KeepinCRMError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 30
        request.setValue(apiToken, forHTTPHeaderField: "X-Auth-Token")
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            switch urlError.code {
            case .cannotFindHost:
                throw KeepinCRMError.network(message: "Не вдалось знайти сервер api.keepincrm.com. Перевірте інтернет, DNS або VPN.")
            case .notConnectedToInternet:
                throw KeepinCRMError.network(message: "Немає інтернет-зʼєднання.")
            case .timedOut:
                throw KeepinCRMError.network(message: "Таймаут запиту до KeepinCRM. Спробуйте ще раз.")
            default:
                throw KeepinCRMError.network(message: "Мережева помилка: \(urlError.localizedDescription)")
            }
        }
        guard let httpResponse = response as? HTTPURLResponse else {
            throw KeepinCRMError.badResponse
        }

        switch httpResponse.statusCode {
        case 200:
            return try decoder.decode(Response.self, from: data)
        case 401:
            throw KeepinCRMError.unauthorized
        case 429:
            throw KeepinCRMError.rateLimited
        default:
            throw KeepinCRMError.serverError(code: httpResponse.statusCode)
        }
    }

    private func backendRequest<Response: Decodable>(path: String, body: SyncRequestBody) async throws -> Response {
        guard let url = URL(string: backendBaseURL + path) else {
            throw KeepinCRMError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let urlError as URLError {
            switch urlError.code {
            case .cannotFindHost:
                throw KeepinCRMError.network(message: "Не вдалось знайти сервер backend. Перевірте інтернет або Render URL.")
            case .notConnectedToInternet:
                throw KeepinCRMError.network(message: "Немає інтернет-зʼєднання.")
            case .timedOut:
                throw KeepinCRMError.network(message: "Таймаут запиту до backend. Спробуйте ще раз.")
            default:
                throw KeepinCRMError.network(message: "Мережева помилка: \(urlError.localizedDescription)")
            }
        }

        guard let httpResponse = response as? HTTPURLResponse else {
            throw KeepinCRMError.badResponse
        }

        if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
            return try JSONDecoder().decode(Response.self, from: data)
        }

        if let backendError = try? JSONDecoder().decode(BackendErrorResponse.self, from: data),
           !backendError.error.isEmpty {
            throw KeepinCRMError.backend(message: backendError.error)
        }
        throw KeepinCRMError.serverError(code: httpResponse.statusCode)
    }
}

private struct SyncRequestBody: Encodable {
    let token: String?
    let dateFrom: String
    let dateTo: String
    let managerIds: [Int]
}

private struct BackendErrorResponse: Decodable {
    let error: String
}

struct BackendSyncResponse: Decodable {
    let summary: BackendSummary?
    let stages: [String]?
    let agreements: [BackendAgreement]
    let meta: BackendMeta?
}

struct BackendMeta: Decodable {
    let loaded: Int
    let sourceLoaded: Int

    enum CodingKeys: String, CodingKey {
        case loaded
        case sourceLoaded
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        loaded = container.decodeFlexibleInt(forKey: .loaded) ?? 0
        sourceLoaded = container.decodeFlexibleInt(forKey: .sourceLoaded) ?? 0
    }
}

struct BackendSummary: Decodable {
    let totalRevenue: Double?
    let successfulRevenue: Double?
    let failedRevenue: Double?
    let agreementsCount: Int?
    let wonCount: Int?
    let failedCount: Int?
}

struct BackendSyncLogsResponse: Decodable {
    let items: [BackendSyncLogItem]
}

struct BackendSyncLogItem: Decodable {
    let id: Int
    let startedAt: String?
    let finishedAt: String?
    let durationMs: Int?
    let durationSec: Double?
    let status: String?
    let loadedCount: Int?
    let sourceLoadedCount: Int?
    let errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id, startedAt, finishedAt, durationMs, durationSec, status, loadedCount, sourceLoadedCount, errorMessage
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id) ?? 0
        startedAt = try container.decodeIfPresent(String.self, forKey: .startedAt)
        finishedAt = try container.decodeIfPresent(String.self, forKey: .finishedAt)
        durationMs = container.decodeFlexibleInt(forKey: .durationMs)
        durationSec = container.decodeFlexibleDouble(forKey: .durationSec)
        status = try container.decodeIfPresent(String.self, forKey: .status)
        loadedCount = container.decodeFlexibleInt(forKey: .loadedCount)
        sourceLoadedCount = container.decodeFlexibleInt(forKey: .sourceLoadedCount)
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
    }
}

struct BackendAgreement: Decodable {
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
    let sourceName: String?
    let clientId: Int?
    let clientName: String?

    enum CodingKeys: String, CodingKey {
        case id, title, orderedAt, createdAt, updatedAt, total, result, managerId, managerName, stageName, sourceName, clientId, clientName
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id) ?? 0
        title = try container.decodeIfPresent(String.self, forKey: .title)
        orderedAt = try container.decodeIfPresent(String.self, forKey: .orderedAt)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        total = container.decodeFlexibleDouble(forKey: .total)
        result = try container.decodeIfPresent(String.self, forKey: .result)
        managerId = container.decodeFlexibleInt(forKey: .managerId)
        managerName = try container.decodeIfPresent(String.self, forKey: .managerName)
        stageName = try container.decodeIfPresent(String.self, forKey: .stageName)
        sourceName = try container.decodeIfPresent(String.self, forKey: .sourceName)
        clientId = container.decodeFlexibleInt(forKey: .clientId)
        clientName = try container.decodeIfPresent(String.self, forKey: .clientName)
    }

    func toCRMAgreement() -> CRMAgreement {
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
            source: CRMSource(id: nil, name: sourceName),
            client: CRMClient(
                id: clientId ?? 0,
                person: clientName,
                company: nil,
                email: nil,
                phones: nil,
                lead: nil,
                source: nil,
                mainResponsible: CRMUser(id: managerId, name: managerName)
            )
        )
    }
}
private extension KeyedDecodingContainer {
    func decodeFlexibleInt(forKey key: K) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return value
        }
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return Int(value)
        }
        if let value = try? decodeIfPresent(String.self, forKey: key) {
            return Int(value)
        }
        return nil
    }

    func decodeFlexibleDouble(forKey key: K) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return value
        }
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return Double(value)
        }
        if let stringValue = try? decodeIfPresent(String.self, forKey: key) {
            let normalized = stringValue
                .replacingOccurrences(of: " ", with: "")
                .replacingOccurrences(of: ",", with: ".")
            return Double(normalized)
        }
        return nil
    }
}

