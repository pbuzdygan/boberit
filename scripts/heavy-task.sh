#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
builder_name=boberit-local-limited
builder_container="buildx_buildkit_${builder_name}0"
scan_name="boberit-local-trivy-$(id -u)"
work_dir=''
stop_builder=false
scan_started=false

usage() {
  printf '%s\n' 'Usage: bash scripts/heavy-task.sh setup|status|build [image-tag]|scan <local-image>'
}
cleanup() {
  if [[ "$scan_started" == true ]]; then docker rm -f "$scan_name" >/dev/null 2>&1 || true; fi
  if [[ "$stop_builder" == true ]]; then docker buildx stop "$builder_name" >/dev/null 2>&1 || true; fi
  if [[ -n "$work_dir" ]]; then rm -rf -- "$work_dir"; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Shared by all invocations by this user, including different repo checkouts.
exec 9>"/tmp/boberit-heavy-$(id -u).lock"
if ! flock -n 9; then
  printf '%s\n' 'Another Boberit heavy task is running. Try again after it finishes.' >&2
  exit 75
fi

require_headroom() {
  local required="$1" memory_max memory_current
  if [[ ! -r /sys/fs/cgroup/memory.max || ! -r /sys/fs/cgroup/memory.current ]]; then
    printf '%s\n' 'Cannot verify cgroup v2 memory headroom; run this task in CI instead.' >&2
    exit 1
  fi
  read -r memory_max < /sys/fs/cgroup/memory.max
  read -r memory_current < /sys/fs/cgroup/memory.current
  if [[ "$memory_max" != max ]] && (( memory_max - memory_current < required )); then
    printf '%s\n' 'Insufficient memory headroom. Stop unused tasks or run this task in CI.' >&2
    exit 1
  fi
}

check_builder_limits() {
  local actual
  actual="$(docker inspect --format '{{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.CpuQuota}} {{.HostConfig.CpuPeriod}}' "$builder_container")"
  if [[ "$actual" != '1610612736 1610612736 100000 100000' ]]; then
    printf 'Unexpected builder limits: %s. Refusing to build.\n' "$actual" >&2
    exit 1
  fi
}

setup_builder() {
  if ! docker buildx inspect "$builder_name" >/dev/null 2>&1; then
    docker buildx create --name "$builder_name" --driver docker-container \
      --driver-opt memory=1536m,memory-swap=1536m,cpu-quota=100000,cpu-period=100000,restart-policy=no \
      --buildkitd-config "$repo_dir/scripts/buildkit-local.toml" >/dev/null
  fi
  if [[ "$(docker buildx inspect "$builder_name" | awk '$1 == "Driver:" { print $2 }')" != docker-container ]]; then
    printf '%s\n' 'Expected a dedicated docker-container builder. Refusing to continue.' >&2
    exit 1
  fi
  stop_builder=true
  docker buildx inspect --bootstrap "$builder_name"
  check_builder_limits
}

case "${1:-}" in
  setup)
    [[ $# == 1 ]] || { usage; exit 2; }
    require_headroom 2684354560 # 1.5 GiB builder plus 1 GiB reserve.
    setup_builder
    printf '%s\n' 'Builder configured: 1.5 GiB RAM, no swap, 1 CPU, one build step at a time.'
    ;;
  status)
    [[ $# == 1 ]] || { usage; exit 2; }
    docker buildx inspect "$builder_name"
    check_builder_limits
    docker inspect --format 'Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}} CPUQuota={{.HostConfig.CpuQuota}} CPUPeriod={{.HostConfig.CpuPeriod}}' "$builder_container"
    ;;
  build)
    [[ $# -le 2 ]] || { usage; exit 2; }
    require_headroom 2684354560
    setup_builder
    docker buildx build --builder "$builder_name" --load --no-cache-filter runtime \
      --progress plain --tag "${2:-boberit:local}" "$repo_dir"
    ;;
  scan)
    [[ $# == 2 && "$2" != -* ]] || { usage; exit 2; }
    require_headroom 2147483648 # 1 GiB scanner plus 1 GiB reserve.
    # A previous interrupted build must not keep consuming memory during a scan.
    if docker buildx inspect "$builder_name" >/dev/null 2>&1; then
      docker buildx stop "$builder_name"
    fi
    mkdir -p "$repo_dir/.tmp/trivy-cache"
    work_dir="$(mktemp -d "$repo_dir/.tmp/trivy-scan.XXXXXX")"
    mkdir "$work_dir/tmp"
    docker image inspect "$2" >/dev/null
    docker save --output "$work_dir/image.tar" "$2"
    scan_started=true
    docker run --rm --name "$scan_name" --memory 1g --memory-swap 1g --cpus 1 \
      --pids-limit 256 --read-only --cap-drop ALL --security-opt no-new-privileges \
      --user "$(id -u):$(id -g)" --env GOMEMLIMIT=700MiB \
      --mount "type=bind,src=$work_dir,dst=/scan,readonly" \
      --mount "type=bind,src=$work_dir/tmp,dst=/tmp" \
      --mount "type=bind,src=$repo_dir/.tmp/trivy-cache,dst=/cache" \
      aquasec/trivy:0.74.0 image --cache-dir /cache --input /scan/image.tar \
      --parallel 1 --timeout 10m --scanners vuln --pkg-types os,library \
      --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 --no-progress
    ;;
  *) usage; exit 2 ;;
esac
