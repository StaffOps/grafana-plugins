// Jest setup provided by Grafana scaffolding
import './.config/jest-setup';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = jest.fn();
