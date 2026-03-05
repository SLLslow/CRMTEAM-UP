//
//  ContentView.swift
//  CRMTeamLid
//
//  Created by Ігор on 05.03.2026.
//

import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = SyncViewModel()
    @State private var expandedManagerIDs: Set<Int> = []
    @State private var isStagesExpanded = false

    var body: some View {
        TabView {
            exchangeTab
                .tabItem {
                    Label("Обмін", systemImage: "arrow.triangle.2.circlepath")
                }

            dataTab
                .tabItem {
                    Label("Дані", systemImage: "tablecells")
                }
        }
    }

    private var exchangeTab: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    controlsCard
                    statusCard
                }
                .frame(maxWidth: 960, alignment: .leading)
                .padding()
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Обмін")
        }
    }

    private var dataTab: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if viewModel.summary != nil {
                        dataFiltersCard

                        let filteredAgreements = viewModel.filteredAgreementsForData
                        let filteredSummary = AnalyticsBuilder.build(
                            agreements: filteredAgreements,
                            clients: uniqueClients(from: filteredAgreements)
                        )

                        summaryCard(summary: filteredSummary)
                        managersTable(summary: filteredSummary)
                        managerBlocks(agreements: filteredAgreements)
                    } else {
                        card {
                            Text("Натисніть 'Оновити дані' у вкладці 'Обмін'.")
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(maxWidth: 960, alignment: .leading)
                .padding()
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Дані")
        }
    }

    private var controlsCard: some View {
        card {
            VStack(alignment: .leading, spacing: 12) {
                Text("Оновлення")
                    .font(.headline)

                SecureField("KeepinCRM API token (X-Auth-Token)", text: $viewModel.keepinApiToken)
                    .textFieldStyle(.roundedBorder)
                Toggle("Запам’ятати токен", isOn: $viewModel.rememberToken)

                Group {
                    DatePicker("Період угод: від", selection: $viewModel.orderDateFrom, displayedComponents: .date)
                    DatePicker("Період угод: до", selection: $viewModel.orderDateTo, displayedComponents: .date)
                }

                Text("Менеджери")
                    .font(.subheadline)
                    .fontWeight(.semibold)

                ForEach(SyncViewModel.availableManagers) { manager in
                    Toggle("\(manager.name) (ID: \(manager.id))", isOn: managerBinding(manager.id))
                }

                Button("Оновити дані") {
                    Task { await viewModel.loadDashboard() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.isLoading)

                if viewModel.isLoading {
                    ProgressView()
                }

                Text("Отримуємо тільки з CRM (read-only). Етапи угод також завантажуються.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var dataFiltersCard: some View {
        card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Фільтри у вкладці 'Дані'")
                    .font(.headline)

                HStack(spacing: 16) {
                    DatePicker("Від", selection: $viewModel.dataDateFrom, displayedComponents: .date)
                    DatePicker("До", selection: $viewModel.dataDateTo, displayedComponents: .date)
                }

                DisclosureGroup(
                    isExpanded: $isStagesExpanded,
                    content: {
                        HStack {
                            Button("Усі") {
                                viewModel.selectedStages = Set(viewModel.availableStages)
                            }
                            Button("Очистити") {
                                viewModel.selectedStages.removeAll()
                            }
                            Spacer()
                            Text("Вибрано: \(viewModel.selectedStages.count)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                            ForEach(viewModel.availableStages, id: \.self) { stage in
                                Toggle(stage, isOn: stageBinding(stage))
                                    .toggleStyle(.checkbox)
                            }
                        }
                        .padding(.top, 4)
                    },
                    label: {
                        Text("Етапи")
                            .font(.subheadline)
                            .fontWeight(.semibold)
                    }
                )
                .padding(.top, 2)
                if !isStagesExpanded {
                    Text(viewModel.selectedStages.isEmpty ? "Етапи не вибрані" : "Етапи вибрано: \(viewModel.selectedStages.count)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var statusCard: some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Статус")
                    .font(.headline)
                Text(viewModel.statusMessage)
                if !viewModel.lastError.isEmpty {
                    Text(viewModel.lastError)
                        .foregroundStyle(.red)
                }
            }
        }
    }

    private func summaryCard(summary: AnalyticsSummary) -> some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Загалом")
                    .font(.headline)
                HStack {
                    infoCell("Угод", "\(summary.agreementsCount)")
                    infoCell("Сума", currency(summary.totalRevenue))
                    infoCell("Успішні", "\(summary.wonCount)")
                    infoCell("Неуспішні", "\(summary.failedCount)")
                }
            }
        }
    }

    private func managersTable(summary: AnalyticsSummary) -> some View {
        card {
            VStack(alignment: .leading, spacing: 8) {
                Text("Менеджер | К-сть угод | Сума | Успішні | Неуспішні")
                    .font(.headline)

                tableHeader
                Divider()

                ForEach(summary.managerItems) { item in
                    HStack(spacing: 8) {
                        Text(item.manager)
                            .frame(width: 280, alignment: .leading)
                        Text("\(item.dealsCount)")
                            .frame(width: 90, alignment: .trailing)
                        Text(currency(item.revenue))
                            .frame(width: 140, alignment: .trailing)
                        Text("\(item.successfulCount)")
                            .frame(width: 90, alignment: .trailing)
                        Text("\(item.failedCount)")
                            .frame(width: 110, alignment: .trailing)
                    }
                    .font(.system(size: 14, weight: .medium))
                    Divider()
                }
            }
        }
    }

    private func managerBlocks(agreements: [CRMAgreement]) -> some View {
        card {
            VStack(alignment: .leading, spacing: 10) {
                Text("Угоди по менеджерах")
                    .font(.headline)

                ForEach(SyncViewModel.availableManagers) { manager in
                    if viewModel.isManagerSelected(manager.id) {
                        let items = agreementsForManager(manager.id, in: agreements)
                        DisclosureGroup(
                            isExpanded: expandedBinding(for: manager.id),
                            content: {
                                if items.isEmpty {
                                    Text("Немає угод у вибраному періоді")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(items, id: \.id) { agreement in
                                        VStack(alignment: .leading, spacing: 2) {
                                            HStack {
                                                Text(agreement.title?.nonEmpty ?? "Угода #\(agreement.id)")
                                                Spacer()
                                                Text(currency(agreement.total ?? 0))
                                                    .fontWeight(.semibold)
                                            }
                                            Text("Етап: \(agreement.stage?.name ?? "-")")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                        Divider()
                                    }
                                }
                            },
                            label: {
                                Text("\(manager.name) (\(items.count) угод)")
                                    .fontWeight(.semibold)
                            }
                        )
                    }
                }
            }
        }
    }

    private var tableHeader: some View {
        HStack(spacing: 8) {
            Text("Менеджер")
                .frame(width: 280, alignment: .leading)
            Text("Угод")
                .frame(width: 90, alignment: .trailing)
            Text("Сума")
                .frame(width: 140, alignment: .trailing)
            Text("Успішні")
                .frame(width: 90, alignment: .trailing)
            Text("Неуспішні")
                .frame(width: 110, alignment: .trailing)
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(.secondary)
    }

    private func infoCell(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.system(size: 16, weight: .semibold))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func managerBinding(_ managerID: Int) -> Binding<Bool> {
        Binding(
            get: { viewModel.isManagerSelected(managerID) },
            set: { viewModel.setManager(managerID, isSelected: $0) }
        )
    }

    private func stageBinding(_ stage: String) -> Binding<Bool> {
        Binding(
            get: { viewModel.selectedStages.contains(stage) },
            set: { isEnabled in
                if isEnabled {
                    viewModel.selectedStages.insert(stage)
                } else {
                    viewModel.selectedStages.remove(stage)
                }
            }
        )
    }

    private func agreementsForManager(_ managerID: Int, in agreements: [CRMAgreement]) -> [CRMAgreement] {
        agreements.filter { $0.mainResponsible?.id == managerID }
    }

    private func uniqueClients(from agreements: [CRMAgreement]) -> [CRMClient] {
        var clientsById: [Int: CRMClient] = [:]
        for agreement in agreements {
            if let client = agreement.client, client.id != 0 {
                clientsById[client.id] = client
            }
        }
        return Array(clientsById.values)
    }

    private func expandedBinding(for managerID: Int) -> Binding<Bool> {
        Binding(
            get: { expandedManagerIDs.contains(managerID) },
            set: { isExpanded in
                if isExpanded {
                    expandedManagerIDs.insert(managerID)
                } else {
                    expandedManagerIDs.remove(managerID)
                }
            }
        )
    }

    private func card<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        content()
            .padding()
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(nsColor: .windowBackgroundColor))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(Color.gray.opacity(0.2), lineWidth: 1)
            )
    }

    private func currency(_ value: Double) -> String {
        String(format: "%.2f грн", value)
    }
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

#Preview {
    ContentView()
}
