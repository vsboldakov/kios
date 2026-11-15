// shortcut: brew install runs `bun install` on the machine, ship a per-platform binary when `bun build --compile` embeds libopentui

export function formula(repo: string, version: string, sha256: string): string {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`invalid repo ${repo}`)
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid version ${version}`)
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`invalid sha256 ${sha256}`)
  return [
    "class Kios < Formula",
    '  desc "Terminal UI for Kubernetes workloads"',
    `  homepage "https://github.com/${repo}"`,
    `  url "https://github.com/${repo}/archive/refs/tags/v${version}.tar.gz"`,
    `  sha256 "${sha256}"`,
    '  license "MIT"',
    "",
    '  depends_on "bun"',
    "",
    "  def install",
    '    system "bun", "install", "--production"',
    '    libexec.install Dir["*"]',
    '    (bin/"kios").write <<~SH',
    "      #!/bin/bash",
    '      cd "#{libexec}" || exit 1',
    '      exec "#{Formula["bun"].opt_bin}/bun" "src/index.tsx" "$@"',
    "    SH",
    '    chmod 0755, bin/"kios"',
    "  end",
    "",
    "  def caveats",
    "    <<~EOS",
    "      kios needs kubectl on your PATH.",
    "    EOS",
    "  end",
    "",
    "  test do",
    '    assert_match "kios", File.read("#{libexec}/package.json")',
    "  end",
    "end",
    "",
  ].join("\n")
}
