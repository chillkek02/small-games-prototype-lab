const frame = document.querySelector('.screen-frame');
const iframe = document.querySelector('#gameFrame');
const desktopButton = document.querySelector('#previewDesktop');
const phoneButton = document.querySelector('#previewPhone');
const viewportLabel = document.querySelector('#previewViewportLabel');

if (frame && iframe && desktopButton && phoneButton) {
  const MODES = {
    desktop: { width: 1440, height: 900, label: '1440×900' },
    phone: { width: 390, height: 844, label: '390×844' }
  };

  let mode = window.matchMedia('(max-width: 760px)').matches ? 'phone' : 'desktop';

  function fitPreview() {
    const target = MODES[mode];
    const availableWidth = Math.max(1, frame.clientWidth - 24);
    const availableHeight = Math.max(1, frame.clientHeight - 24);
    const scale = Math.min(availableWidth / target.width, availableHeight / target.height, 1);

    iframe.style.width = `${target.width}px`;
    iframe.style.height = `${target.height}px`;
    iframe.style.position = 'absolute';
    iframe.style.left = '50%';
    iframe.style.top = '50%';
    iframe.style.transformOrigin = 'center center';
    iframe.style.transform = `translate(-50%, -50%) scale(${scale})`;

    frame.dataset.deviceMode = mode;
    frame.style.setProperty('--device-scale', String(scale));
    desktopButton.classList.toggle('active', mode === 'desktop');
    phoneButton.classList.toggle('active', mode === 'phone');
    desktopButton.setAttribute('aria-pressed', String(mode === 'desktop'));
    phoneButton.setAttribute('aria-pressed', String(mode === 'phone'));
    if (viewportLabel) viewportLabel.textContent = `${mode === 'desktop' ? 'Desktop' : 'Phone'} · ${target.label}`;
  }

  function setMode(nextMode) {
    if (!MODES[nextMode]) return;
    mode = nextMode;
    fitPreview();
  }

  desktopButton.addEventListener('click', () => setMode('desktop'));
  phoneButton.addEventListener('click', () => setMode('phone'));

  const observer = new ResizeObserver(() => fitPreview());
  observer.observe(frame);
  window.addEventListener('orientationchange', () => setTimeout(fitPreview, 100));
  window.addEventListener('resize', fitPreview);
  fitPreview();
}
