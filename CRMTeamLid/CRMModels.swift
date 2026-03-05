import Foundation

struct PaginatedResponse<Item: Decodable>: Decodable {
    let items: [Item]
    let pagination: Pagination?
}

struct Pagination: Decodable {
    let totalCount: Int?
    let totalPages: Int?
    let currentPage: Int?
}

struct CRMUser: Decodable {
    let id: Int?
    let name: String?

    enum CodingKeys: String, CodingKey {
        case id, name
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
    }

    init(id: Int?, name: String?) {
        self.id = id
        self.name = name
    }
}

struct CRMSource: Decodable {
    let id: Int?
    let name: String?

    enum CodingKeys: String, CodingKey {
        case id, name
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id)
        name = try container.decodeIfPresent(String.self, forKey: .name)
    }

    init(id: Int?, name: String?) {
        self.id = id
        self.name = name
    }
}

struct CRMAgreementStage: Decodable {
    let name: String?

    init(name: String?) {
        self.name = name
    }
}

struct CRMAgreement: Decodable {
    let id: Int
    let title: String?
    let orderedAt: String?
    let createdAt: String?
    let updatedAt: String?
    let total: Double?
    let result: String?
    let mainResponsible: CRMUser?
    let stage: CRMAgreementStage?
    let source: CRMSource?
    let client: CRMClient?

    enum CodingKeys: String, CodingKey {
        case id, title, orderedAt, createdAt, updatedAt, total, totalAmount, result, mainResponsible, stage, source, client
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id) ?? 0
        title = try container.decodeIfPresent(String.self, forKey: .title)
        orderedAt = try container.decodeIfPresent(String.self, forKey: .orderedAt)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt)
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt)
        result = try container.decodeIfPresent(String.self, forKey: .result)
        mainResponsible = try container.decodeIfPresent(CRMUser.self, forKey: .mainResponsible)
        stage = try container.decodeIfPresent(CRMAgreementStage.self, forKey: .stage)
        source = try container.decodeIfPresent(CRMSource.self, forKey: .source)
        client = try container.decodeIfPresent(CRMClient.self, forKey: .client)
        total = container.decodeFlexibleDouble(forKey: .totalAmount) ?? container.decodeFlexibleDouble(forKey: .total)
    }

    init(
        id: Int,
        title: String?,
        orderedAt: String?,
        createdAt: String?,
        updatedAt: String?,
        total: Double?,
        result: String?,
        mainResponsible: CRMUser?,
        stage: CRMAgreementStage?,
        source: CRMSource?,
        client: CRMClient?
    ) {
        self.id = id
        self.title = title
        self.orderedAt = orderedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.total = total
        self.result = result
        self.mainResponsible = mainResponsible
        self.stage = stage
        self.source = source
        self.client = client
    }
}

struct CRMClient: Decodable {
    let id: Int
    let person: String?
    let company: String?
    let email: String?
    let phones: [String]?
    let lead: Bool?
    let source: CRMSource?
    let mainResponsible: CRMUser?

    enum CodingKeys: String, CodingKey {
        case id, person, company, email, phones, lead, source, mainResponsible
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeFlexibleInt(forKey: .id) ?? 0
        person = try container.decodeIfPresent(String.self, forKey: .person)
        company = try container.decodeIfPresent(String.self, forKey: .company)
        email = try container.decodeIfPresent(String.self, forKey: .email)
        phones = try container.decodeIfPresent([String].self, forKey: .phones)
        lead = try container.decodeIfPresent(Bool.self, forKey: .lead)
        source = try container.decodeIfPresent(CRMSource.self, forKey: .source)
        mainResponsible = try container.decodeIfPresent(CRMUser.self, forKey: .mainResponsible)
    }

    init(
        id: Int,
        person: String?,
        company: String?,
        email: String?,
        phones: [String]?,
        lead: Bool?,
        source: CRMSource?,
        mainResponsible: CRMUser?
    ) {
        self.id = id
        self.person = person
        self.company = company
        self.email = email
        self.phones = phones
        self.lead = lead
        self.source = source
        self.mainResponsible = mainResponsible
    }
}

struct AgreementSheetRow: Encodable {
    let id: Int
    let title: String
    let createdAt: String
    let updatedAt: String
    let total: Double
    let result: String
    let manager: String
    let stage: String
    let source: String
}

struct ClientSheetRow: Encodable {
    let id: Int
    let name: String
    let company: String
    let email: String
    let phone: String
    let isLead: Bool
    let manager: String
    let source: String
}

struct AnalyticsRow: Encodable {
    let metric: String
    let value: String
}

struct SyncPeriod: Encodable {
    let from: String
    let to: String
}

struct GoogleSyncPayload: Encodable {
    let secret: String?
    let generatedAt: String
    let period: SyncPeriod
    let analytics: [AnalyticsRow]
    let agreements: [AgreementSheetRow]
    let clients: [ClientSheetRow]
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
