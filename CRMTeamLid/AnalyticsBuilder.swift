import Foundation

struct ManagerAnalyticsItem: Identifiable {
    let manager: String
    let revenue: Double
    let dealsCount: Int
    let successfulCount: Int
    let failedCount: Int

    var id: String { manager }
}

struct SourceAnalyticsItem: Identifiable {
    let source: String
    let dealsCount: Int

    var id: String { source }
}

struct AnalyticsSummary {
    let totalRevenue: Double
    let agreementsCount: Int
    let wonCount: Int
    let failedCount: Int
    let activeCount: Int
    let clientsCount: Int
    let leadsCount: Int
    let averageCheck: Double
    let conversionRate: Double
    let managerItems: [ManagerAnalyticsItem]
    let sourceItems: [SourceAnalyticsItem]
}

enum AnalyticsBuilder {
    static func build(agreements: [CRMAgreement], clients: [CRMClient]) -> AnalyticsSummary {
        let totalRevenue = agreements.reduce(0) { $0 + ($1.total ?? 0) }
        let wonCount = agreements.filter { $0.result == "successful" }.count
        let failedCount = agreements.filter { $0.result == "failed" }.count
        let activeCount = agreements.filter { $0.result == "archived" || $0.result == nil }.count
        let leadsCount = clients.filter { $0.lead == true }.count
        let averageCheck = agreements.isEmpty ? 0 : totalRevenue / Double(agreements.count)
        let conversionRate = agreements.isEmpty ? 0 : (Double(wonCount) / Double(agreements.count)) * 100

        let groupedByManager = Dictionary(grouping: agreements) {
            $0.mainResponsible?.name?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Без менеджера"
        }

        let managerItems = groupedByManager
            .map { managerName, rows in
                ManagerAnalyticsItem(
                    manager: managerName,
                    revenue: rows.reduce(0) { $0 + ($1.total ?? 0) },
                    dealsCount: rows.count,
                    successfulCount: rows.filter { $0.result == "successful" }.count,
                    failedCount: rows.filter { $0.result == "failed" }.count
                )
            }
            .sorted { $0.revenue > $1.revenue }

        let sourceItems = Dictionary(grouping: agreements) {
            $0.source?.name?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "Без джерела"
        }
        .map { sourceName, rows in
            SourceAnalyticsItem(source: sourceName, dealsCount: rows.count)
        }
        .sorted { $0.dealsCount > $1.dealsCount }

        return AnalyticsSummary(
            totalRevenue: totalRevenue,
            agreementsCount: agreements.count,
            wonCount: wonCount,
            failedCount: failedCount,
            activeCount: activeCount,
            clientsCount: clients.count,
            leadsCount: leadsCount,
            averageCheck: averageCheck,
            conversionRate: conversionRate,
            managerItems: managerItems,
            sourceItems: sourceItems
        )
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}
