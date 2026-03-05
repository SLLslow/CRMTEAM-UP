//
//  CRMTeamLidTests.swift
//  CRMTeamLidTests
//
//  Created by Ігор on 05.03.2026.
//

import Testing
@testable import CRMTeamLid

struct CRMTeamLidTests {

    @MainActor
    @Test func analyticsSummaryIsCalculated() async throws {
        let agreements = [
            CRMAgreement(
                id: 1,
                title: "Deal A",
                createdAt: nil,
                updatedAt: nil,
                total: 1200,
                result: "successful",
                mainResponsible: CRMUser(id: 1, name: "Anna"),
                stage: nil,
                source: nil
            ),
            CRMAgreement(
                id: 2,
                title: "Deal B",
                createdAt: nil,
                updatedAt: nil,
                total: 500,
                result: "failed",
                mainResponsible: CRMUser(id: 2, name: "Oleg"),
                stage: nil,
                source: nil
            )
        ]
        let clients = [
            CRMClient(
                id: 1,
                person: "Test User",
                company: nil,
                email: nil,
                phones: nil,
                lead: true,
                source: nil,
                mainResponsible: nil
            )
        ]

        let summary = AnalyticsBuilder.build(agreements: agreements, clients: clients)

        #expect(summary.agreementsCount == 2)
        #expect(summary.wonCount == 1)
        #expect(summary.failedCount == 1)
        #expect(summary.totalRevenue == 1700)
    }

}
