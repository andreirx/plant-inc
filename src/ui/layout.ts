const MOBILE_BREAKPOINT = 768;

export interface QuadrantElements {
  root: HTMLDivElement;
  airView: HTMLDivElement;
  soilView: HTMLDivElement;
  mapView: HTMLDivElement;
  evolutionUI: HTMLDivElement;
}

/**
 * Creates the 4-quadrant CSS Grid layout.
 *
 * Desktop: 2x2 grid filling the viewport.
 * Mobile: Single column stack (air, soil, map, evolution).
 */
export function createLayout(container: HTMLElement): QuadrantElements {
  const root = document.createElement('div');
  root.id = 'quadrant-grid';

  const airView = document.createElement('div');
  airView.id = 'q-air';
  airView.className = 'quadrant';

  const soilView = document.createElement('div');
  soilView.id = 'q-soil';
  soilView.className = 'quadrant';

  const mapView = document.createElement('div');
  mapView.id = 'q-map';
  mapView.className = 'quadrant';

  const evolutionUI = document.createElement('div');
  evolutionUI.id = 'q-evolution';
  evolutionUI.className = 'quadrant';

  root.append(airView, mapView, soilView, evolutionUI);
  container.appendChild(root);

  applyStyles();
  handleResize(root);
  window.addEventListener('resize', () => handleResize(root));

  return { root, airView, soilView, mapView, evolutionUI };
}

function applyStyles(): void {
  const style = document.createElement('style');
  style.textContent = `
    #quadrant-grid {
      width: 100%;
      height: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      gap: 2px;
      background: #0d0d1a;
    }

    .quadrant {
      position: relative;
      overflow: hidden;
      background: #16213e;
      border: 1px solid #0f3460;
    }

    #q-air { grid-area: 1 / 1 / 2 / 2; }
    #q-map { grid-area: 1 / 2 / 2 / 3; }
    #q-soil { grid-area: 2 / 1 / 3 / 2; }
    #q-evolution { grid-area: 2 / 2 / 3 / 3; }

    @media (max-width: ${MOBILE_BREAKPOINT}px) {
      #quadrant-grid {
        grid-template-columns: 1fr;
        grid-template-rows: 1fr 1fr 1fr 1fr;
      }
      #q-air { grid-area: 1 / 1 / 2 / 2; }
      #q-soil { grid-area: 2 / 1 / 3 / 2; }
      #q-map { grid-area: 3 / 1 / 4 / 2; }
      #q-evolution { grid-area: 4 / 1 / 5 / 2; }
    }
  `;
  document.head.appendChild(style);
}

function handleResize(root: HTMLDivElement): void {
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  root.dataset.layout = isMobile ? 'mobile' : 'desktop';
}
