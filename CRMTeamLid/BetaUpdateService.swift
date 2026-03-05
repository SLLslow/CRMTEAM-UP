import Foundation

struct AppUpdateInfo {
    let version: String
    let notes: String
    let htmlURL: URL
    let downloadURL: URL?
    let isPrerelease: Bool
}

enum AppUpdateError: LocalizedError {
    case invalidURL
    case invalidResponse
    case noReleases
    case noDownloadAsset
    case unzipFailed
    case noAppInArchive
    case appLocationNotWritable
    case installScriptFailed
    case unsupportedPlatform

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Некоректний URL перевірки оновлень."
        case .invalidResponse:
            return "Не вдалося отримати відповідь від GitHub Releases."
        case .noReleases:
            return "Немає доступних релізів."
        case .noDownloadAsset:
            return "У релізі немає .zip файлу застосунку."
        case .unzipFailed:
            return "Не вдалося розпакувати файл оновлення."
        case .noAppInArchive:
            return "У пакеті оновлення не знайдено .app."
        case .appLocationNotWritable:
            return "Немає прав запису в папку застосунку. Перемістіть додаток у доступну папку (наприклад, Desktop або ~/Applications)."
        case .installScriptFailed:
            return "Не вдалося запустити встановлення оновлення."
        case .unsupportedPlatform:
            return "Встановлення оновлення доступне лише на macOS."
        }
    }
}

struct BetaUpdateService {
    private let owner = "SLLslow"
    private let repo = "CRMTEAM-UP"
    private let session: URLSession

    init(session: URLSession = .shared) {
        self.session = session
    }

    func fetchLatestRelease(preferBeta: Bool = true) async throws -> AppUpdateInfo {
        guard let url = URL(string: "https://api.github.com/repos/\(owner)/\(repo)/releases") else {
            throw AppUpdateError.invalidURL
        }

        var request = URLRequest(url: url)
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("CRMTeamLid", forHTTPHeaderField: "User-Agent")

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
            throw AppUpdateError.invalidResponse
        }

        let releases = try JSONDecoder().decode([GitHubRelease].self, from: data)
        guard !releases.isEmpty else { throw AppUpdateError.noReleases }

        let picked: GitHubRelease
        if preferBeta, let prerelease = releases.first(where: { $0.prerelease }) {
            picked = prerelease
        } else if let stable = releases.first(where: { !$0.draft }) {
            picked = stable
        } else {
            picked = releases[0]
        }

        return AppUpdateInfo(
            version: normalizeVersion(picked.tagName),
            notes: picked.body ?? "",
            htmlURL: picked.htmlURL,
            downloadURL: picked.assets.first(where: { $0.browserDownloadURL.absoluteString.lowercased().hasSuffix(".zip") })?.browserDownloadURL,
            isPrerelease: picked.prerelease
        )
    }

    func isNewer(remoteVersion: String, currentVersion: String) -> Bool {
        compareVersions(remoteVersion, currentVersion) == .orderedDescending
    }

    func install(update: AppUpdateInfo, over currentAppURL: URL) async throws {
        #if !os(macOS)
        throw AppUpdateError.unsupportedPlatform
        #else
        guard let downloadURL = update.downloadURL else {
            throw AppUpdateError.noDownloadAsset
        }

        let targetAppURL = try resolveTargetAppURL(currentAppURL: currentAppURL)
        let targetDir = targetAppURL.deletingLastPathComponent()

        let tempRoot = FileManager.default.temporaryDirectory.appendingPathComponent("crmteamlid-update-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: tempRoot, withIntermediateDirectories: true)
        let zipURL = tempRoot.appendingPathComponent("update.zip")
        let unzipDir = tempRoot.appendingPathComponent("unzipped")
        try FileManager.default.createDirectory(at: unzipDir, withIntermediateDirectories: true)

        let (downloaded, _) = try await session.download(from: downloadURL)
        try FileManager.default.moveItem(at: downloaded, to: zipURL)

        let unzipOK = try runProcess(
            launchPath: "/usr/bin/ditto",
            arguments: ["-x", "-k", zipURL.path, unzipDir.path]
        )
        guard unzipOK else { throw AppUpdateError.unzipFailed }

        guard let newAppURL = findAppBundle(in: unzipDir) else {
            throw AppUpdateError.noAppInArchive
        }

        let scriptURL = tempRoot.appendingPathComponent("apply_update.sh")
        let script = """
        #!/bin/bash
        set -e
        APP_PID="\(ProcessInfo.processInfo.processIdentifier)"
        TARGET="\(targetAppURL.path)"
        TARGET_DIR="\(targetDir.path)"
        NEW_APP="\(newAppURL.path)"
        TMP_NEW="$TARGET_DIR/.CRMTeamLid.new.app"
        TMP_OLD="$TARGET_DIR/.CRMTeamLid.old.app"
        while kill -0 "$APP_PID" >/dev/null 2>&1; do
          sleep 1
        done
        cp -R "$NEW_APP" "$TMP_NEW"
        rm -rf "$TMP_OLD" || true
        if [[ -d "$TARGET" ]]; then
          mv "$TARGET" "$TMP_OLD"
        fi
        mv "$TMP_NEW" "$TARGET"
        open "$TARGET"
        rm -rf "$TMP_OLD" || true
        rm -rf "\(tempRoot.path)" || true
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        _ = try runProcess(launchPath: "/bin/chmod", arguments: ["+x", scriptURL.path])

        let launched = try runProcess(
            launchPath: "/bin/bash",
            arguments: ["-c", "nohup '\(scriptURL.path)' >/dev/null 2>&1 &"]
        )
        guard launched else {
            throw AppUpdateError.installScriptFailed
        }
        #endif
    }

    private func normalizeVersion(_ tag: String) -> String {
        tag.replacingOccurrences(of: "v", with: "")
    }

    private func compareVersions(_ lhs: String, _ rhs: String) -> ComparisonResult {
        let left = lhs.split(separator: ".").compactMap { Int($0) }
        let right = rhs.split(separator: ".").compactMap { Int($0) }
        let count = max(left.count, right.count)

        for i in 0..<count {
            let l = i < left.count ? left[i] : 0
            let r = i < right.count ? right[i] : 0
            if l > r { return .orderedDescending }
            if l < r { return .orderedAscending }
        }
        return .orderedSame
    }
}

private struct GitHubRelease: Decodable {
    let tagName: String
    let prerelease: Bool
    let draft: Bool
    let htmlURL: URL
    let body: String?
    let assets: [GitHubAsset]

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case prerelease
        case draft
        case htmlURL = "html_url"
        case body
        case assets
    }
}

private struct GitHubAsset: Decodable {
    let browserDownloadURL: URL

    enum CodingKeys: String, CodingKey {
        case browserDownloadURL = "browser_download_url"
    }
}

private extension BetaUpdateService {
    #if os(macOS)
    func resolveTargetAppURL(currentAppURL: URL) throws -> URL {
        let currentDir = currentAppURL.deletingLastPathComponent()
        if FileManager.default.isWritableFile(atPath: currentDir.path) {
            return currentAppURL
        }

        let homeApps = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Applications", isDirectory: true)
        try FileManager.default.createDirectory(at: homeApps, withIntermediateDirectories: true)
        guard FileManager.default.isWritableFile(atPath: homeApps.path) else {
            throw AppUpdateError.appLocationNotWritable
        }
        return homeApps.appendingPathComponent("CRMTeamLid.app")
    }
    #endif

    func runProcess(launchPath: String, arguments: [String]) throws -> Bool {
        #if os(macOS)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: launchPath)
        process.arguments = arguments
        try process.run()
        process.waitUntilExit()
        return process.terminationStatus == 0
        #else
        return false
        #endif
    }

    func findAppBundle(in folder: URL) -> URL? {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(at: folder, includingPropertiesForKeys: [.isDirectoryKey]) else {
            return nil
        }
        for case let fileURL as URL in enumerator {
            if fileURL.pathExtension == "app" {
                return fileURL
            }
        }
        return nil
    }
}
