<p align="center"><samp>&nbsp;&nbsp;_&nbsp;&nbsp;&nbsp;_&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<br>&nbsp;|&nbsp;|_(_)___&nbsp;___<br>&nbsp;|&nbsp;/&nbsp;/&nbsp;/&nbsp;_&nbsp;(_-&lt;<br>&nbsp;|_\_\_\___/__/</samp></p>
<h1 align="center">kios: a Kubernetes TUI (k8s terminal UI) for kubectl</h1>
<p align="center">A free, open-source Kubernetes UI that runs in your terminal. Browse clusters, read pod logs, exec into containers, port-forward and edit resources, with nothing installed but kubectl.</p>
<p align="center"><img src="assets/imgs/kios-screenshot.png" alt="kios Kubernetes TUI showing pods, deployments and resource details in a terminal k8s dashboard"></p>

---

### Installation

```bash
# Oneliner
curl -fsSL https://raw.githubusercontent.com/vsboldakov/kios/master/install | bash

# Package managers
npm i -g @vsboldakov/kios@latest
bun add --global @vsboldakov/kios@latest
brew tap vsboldakov/kios https://github.com/vsboldakov/kios && brew install kios
```

### Usage

```bash
kios
kios --context prod -n payments
```

`--context` chooses a kubeconfig context. `-n` or `--namespace` opens that namespace.

### About

kios is a free, open-source TUI for managing Kubernetes. It wraps kubectl in a clear, navigable interface, so you get a far better view of your cluster than plain kubectl output, without the learning curve of k9s. It runs right in your terminal (no browser or desktop app), and the only requirement is the kubectl binary.

- Open and free, unlike OpenLens
- Simpler and more user-friendly than k9s
- Terminal-native, unlike Hubble or kubewall
- A better view than raw kubectl, with live, navigable output

### Features

- **Cluster browser**: Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs, Services, Ingresses, ConfigMaps, PVCs, Nodes, Events and more, with live refresh
- **Pod logs**: stream container logs straight in the terminal
- **Shell into pods and nodes**: `kubectl exec` into a container, or debug a node
- **Port-forward** pods and services
- **Workload actions**: restart, roll back, scale, delete, evict, edit YAML, trigger and suspend CronJobs, cordon, uncordon and drain nodes
- **Describe, YAML and JSON** views for every resource
- **Fast navigation**: slash command palette with kubectl short names (`po`, `deploy`, `svc`, `ns`), fuzzy search, filters and sorting
- **Namespaces**: switch and filter namespaces
- **CRD support** for Argo CD, Flux, cert-manager, Istio, Linkerd, Cilium, Karpenter, KEDA, Kyverno, Prometheus Operator, Velero and VolumeSnapshots

### kios vs k9s, Lens and the Kubernetes Dashboard

| | kios | k9s | Lens / OpenLens | Kubernetes Dashboard |
| --- | --- | --- | --- | --- |
| Runs in the terminal | yes | yes | no | no |
| Nothing to install in the cluster | yes | yes | yes | no |
| Free and open source | yes | yes | partly | yes |
| Learning curve | low | high | low | low |

Built on [OpenTUI](https://opentui.com/). Requires only kubectl.

### Contributing

If you're interested in contributing to kios, please read the [contributing guide](./CONTRIBUTING.md) before submitting a pull request.
