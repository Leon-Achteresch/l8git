# Homebrew-Cask fuer l8git.
#
# Zielort: Tap-Repo "Leon-Achteresch/homebrew-tap" als Casks/l8git.rb
# Installation fuer Endnutzer:
#   brew tap Leon-Achteresch/tap
#   brew install --cask l8git
#
# Artefakt: das Universal-DMG aus dem Release-Workflow
# (.github/workflows/release.yml baut macOS mit --target universal-apple-darwin,
#  Tauri benennt das Bundle deshalb "<productName>_<version>_universal.dmg").
#
# PRO RELEASE ZU AKTUALISIEREN: version + sha256.
# Der sha256-Wert unten ist ein PLATZHALTER und muss vor dem ersten echten
# Push durch den Hash des veroeffentlichten DMG ersetzt werden:
#   shasum -a 256 l8git_<version>_universal.dmg
#   # oder ohne Download:
#   brew fetch --cask ./l8git.rb
#
# ALTERNATIVE OHNE HASH (nur als Uebergangsloesung in einem privaten Tap,
# von Homebrew fuer offizielle Casks NICHT akzeptiert):
#   sha256 :no_check
# Damit prueft Homebrew die Integritaet des Downloads nicht mehr. Sinnvoll nur,
# solange die Release-Artefakte noch nicht stabil sind; danach echten Hash setzen.

cask "l8git" do
  version "0.5.0"
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"

  url "https://github.com/Leon-Achteresch/l8git/releases/download/v#{version}/l8git_#{version}_universal.dmg",
      verified: "github.com/Leon-Achteresch/l8git/"
  name "l8git"
  desc "Multi-repository Git desktop client"
  homepage "https://github.com/Leon-Achteresch/l8git"

  livecheck do
    url :url
    strategy :github_latest
  end

  # Die App bringt den Tauri-Updater mit (plugins.updater in tauri.conf.json),
  # aktualisiert sich also selbst. Deshalb meldet brew sie nicht als "outdated".
  auto_updates true

  depends_on macos: ">= :big_sur"

  app "l8git.app"

  # Die Bundles sind aktuell weder signiert noch notarisiert (im Release-Workflow
  # sind nur TAURI_SIGNING_* fuer den Updater gesetzt, keine Apple-ID/Team-ID).
  # Ohne Notarisierung blockiert Gatekeeper den ersten Start. Solange das so ist,
  # entweder diese Zeile aktiv lassen oder Nutzer auf den Rechtsklick-Oeffnen-Weg
  # hinweisen:
  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/l8git.app"],
                   sudo: false
  end

  zap trash: [
    "~/Library/Application Support/com.leon.l8git",
    "~/Library/Caches/com.leon.l8git",
    "~/Library/HTTPStorages/com.leon.l8git",
    "~/Library/Preferences/com.leon.l8git.plist",
    "~/Library/Saved Application State/com.leon.l8git.savedState",
    "~/Library/WebKit/com.leon.l8git",
  ]
end
