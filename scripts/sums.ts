export function sourceArchive(repo: string, version: string): { url: string; file: string } {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error(`invalid repo ${repo}`)
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid version ${version}`)
  return {
    url: `https://github.com/${repo}/archive/refs/tags/v${version}.tar.gz`,
    file: `${repo.slice(repo.indexOf("/") + 1)}-${version}.tar.gz`,
  }
}

export function packageArchive(name: string, version: string): { url: string; file: string } {
  if (!/^(@[\w.-]+\/)?[\w.-]+$/.test(name)) throw new Error(`invalid package ${name}`)
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`invalid version ${version}`)
  const file = `${name.slice(name.indexOf("/") + 1)}-${version}.tgz`
  return {
    url: `https://registry.npmjs.org/${name.replace("/", "%2F")}/-/${file}`,
    file,
  }
}

export function sha256sums(files: readonly { file: string; sha256: string }[]): string {
  const lines = files.map((item) => {
    if (!/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error(`invalid sha256 for ${item.file}`)
    if (!/^[\w.-]+$/.test(item.file)) throw new Error(`invalid archive name ${item.file}`)
    return `${item.sha256}  ${item.file}`
  })
  return `${lines.join("\n")}\n`
}
