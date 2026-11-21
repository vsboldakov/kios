class Kios < Formula
  desc "Terminal UI for Kubernetes workloads"
  homepage "https://github.com/vsboldakov/kios"
  url "https://github.com/vsboldakov/kios/archive/refs/tags/v0.6.0.tar.gz"
  sha256 "12aecff8838bfe8e7458d80e569df901dddb6e96b3a7b55a831644ff23fe775e"
  license "MIT"

  depends_on "bun"

  def install
    system "bun", "install", "--production"
    libexec.install Dir["*"]
    (bin/"kios").write <<~SH
      #!/bin/bash
      cd "#{libexec}" || exit 1
      exec "#{Formula["bun"].opt_bin}/bun" "src/index.tsx" "$@"
    SH
    chmod 0755, bin/"kios"
  end

  def caveats
    <<~EOS
      kios needs kubectl on your PATH.
    EOS
  end

  test do
    assert_match "kios", File.read("#{libexec}/package.json")
  end
end
