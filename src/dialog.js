export async function requestWakeLock() {
  try {
    if (!navigator.wakeLock) return null;
    return await navigator.wakeLock.request('screen');
  } catch {
    return null;
  }
}

export function createDisplayDialog() {
  const element = document.createElement('dialog');
  element.className = 'display';

  const stage = document.createElement('div');
  stage.className = 'stage';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'close';
  close.textContent = 'Close';
  close.setAttribute('aria-label', 'Close the enlarged barcode');

  element.append(stage, close);
  document.body.appendChild(element);

  let sentinel = null;

  const releaseLock = () => {
    if (!sentinel) return;
    const held = sentinel;
    sentinel = null;
    Promise.resolve(held.release()).catch(() => {});
  };

  const doClose = () => element.close();

  stage.addEventListener('click', doClose);
  close.addEventListener('click', doClose);
  element.addEventListener('close', releaseLock);
  element.addEventListener('cancel', releaseLock);

  return {
    element,
    open(svg) {
      stage.innerHTML = svg;
      element.showModal();
      requestWakeLock().then((lock) => {
        if (element.open) sentinel = lock;
        else if (lock) Promise.resolve(lock.release()).catch(() => {});
      });
    },
    close: doClose,
  };
}
