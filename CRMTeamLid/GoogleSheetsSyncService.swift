import Foundation

enum GoogleSheetsSyncError: LocalizedError {
    case badURL
    case requestFailed(code: Int)
    case badResponse

    var errorDescription: String? {
        switch self {
        case .badURL:
            return "Некоректний URL Google Apps Script."
        case .requestFailed(let code):
            return "Помилка синхронізації з Google Sheets. Код: \(code)."
        case .badResponse:
            return "Google Sheets повернув неочікувану відповідь."
        }
    }
}

struct GoogleSheetsSyncService {
    let webAppURL: String
    private let session: URLSession
    private let encoder: JSONEncoder

    init(webAppURL: String, session: URLSession = .shared) {
        self.webAppURL = webAppURL
        self.session = session
        self.encoder = JSONEncoder()
    }

    func send(payload: GoogleSyncPayload) async throws {
        guard let url = URL(string: webAppURL) else {
            throw GoogleSheetsSyncError.badURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try encoder.encode(payload)

        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw GoogleSheetsSyncError.badResponse
        }

        guard (200...299).contains(httpResponse.statusCode) else {
            throw GoogleSheetsSyncError.requestFailed(code: httpResponse.statusCode)
        }

        if !data.isEmpty {
            _ = try? JSONSerialization.jsonObject(with: data)
        }
    }
}

