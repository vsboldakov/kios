class Kios < Formula
  desc "Terminal UI for Kubernetes workloads"
  homepage "https://github.com/vsboldakov/kios"
  url "https://github.com/vsboldakov/kios/archive/refs/tags/v0.2.0.tar.gz"
  sha256 "3ab6110528883cf4739fcc360aa06bbc78fadaf98734736861b0cfa49d6846a5"
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
