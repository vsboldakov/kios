import { expect, test } from "bun:test"
import { formula } from "./formula"

test("renders a Homebrew formula for the tagged source archive", () => {
  const sha = "a".repeat(64)
  const ruby = formula("vsboldakov/kios", "0.1.0", sha)
  expect(ruby).toContain('homepage "https://github.com/vsboldakov/kios"')
  expect(ruby).toContain("https://github.com/vsboldakov/kios/archive/refs/tags/v0.1.0.tar.gz")
  expect(ruby).toContain(`sha256 "${sha}"`)
  expect(ruby).toContain('system "bun", "install", "--production"')
  expect(ruby).toContain('exec "#{Formula["bun"].opt_bin}/bun" "src/index.tsx" "$@"')
  expect(() => formula("vsboldakov/kios", "0.1.0", "nope")).toThrow("invalid sha256")
})
