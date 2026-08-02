type StatusCallback = (online: boolean) => void;

const listeners = new Set<StatusCallback>();
let currentOnline = true;
let started = false;

export function isOnline(): boolean {
  return currentOnline;
}

export function onStatusChange(callback: StatusCallback): () => void {
  listeners.add(callback);
  return () => { listeners.delete(callback); };
}

function broadcast(online: boolean): void {
  listeners.forEach((cb) => {
    try { cb(online); } catch {}
  });
}

export function setOnlineStatus(online: boolean): void {
  if (currentOnline === online) return;
  currentOnline = online;
  broadcast(online);
}

function startMonitoring(): void {
  if (started) return;
  started = true;
  import('@react-native-community/netinfo')
    .then(({ default: NetInfo }) => {
      NetInfo.fetch().then((state) => {
        const online = state.isConnected === true && state.isInternetReachable !== false;
        currentOnline = online;
      }).catch(() => {});
      NetInfo.addEventListener((state) => {
        // isInternetReachable is null while a reachability ping is pending;
        // only an explicit false means offline, so the banner never flickers.
        const online = state.isConnected === true && state.isInternetReachable !== false;
        setOnlineStatus(online);
      });
    })
    .catch(() => {});
}

startMonitoring();
