import { PanelPlugin } from '@grafana/data';
import { ServiceMapOptions } from './types';
import { ServiceMapPanel } from './components/ServiceMapPanel';
import { buildPanelOptions } from './options';

export const plugin = new PanelPlugin<ServiceMapOptions>(ServiceMapPanel).setPanelOptions(buildPanelOptions);
