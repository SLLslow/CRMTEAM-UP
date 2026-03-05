import Foundation

enum KeepinCRMError: LocalizedError {
    case badURL
    case badResponse
    case unauthorized
    case rateLimited
    case serverError(code: Int)
    case network(message: String)

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
        }
    }
}

struct KeepinCRMService {
    private let baseURL = "https://api.keepincrm.com/v1"
    private let apiToken: String
    private let session: URLSession
    private let decoder: JSONDecoder

    init(apiToken: String, session: URLSession = .shared) {
        self.apiToken = apiToken
        self.session = session
        self.decoder = JSONDecoder()
        self.decoder.keyDecodingStrategy = .convertFromSnakeCase
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
}
