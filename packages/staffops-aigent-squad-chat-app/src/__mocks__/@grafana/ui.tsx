/**
 * Minimal mock for @grafana/ui — renders the components as simple DOM wrappers
 * so that tests can focus on behavior, not Grafana UI internals.
 */
import React from 'react';

export const Alert = ({ children, title, severity, ...rest }: any) => (
  <div data-testid={rest['data-testid']} role="alert" data-severity={severity}>
    <strong>{title}</strong>
    {children}
  </div>
);

export const Button = ({ children, onClick, disabled, variant, ...rest }: any) => (
  <button onClick={onClick} disabled={disabled} data-variant={variant} data-testid={rest['data-testid']}>
    {children}
  </button>
);

export const LoadingPlaceholder = ({ text, ...rest }: any) => (
  <div data-testid={rest['data-testid']}>{text}</div>
);

export const Spinner = ({ inline }: any) => <span data-testid="spinner" />;

export const Field = ({ children, label, description }: any) => (
  <label>
    <span>{label}</span>
    {description ? <small>{description}</small> : null}
    {children}
  </label>
);

export const Input = ({ value, onChange, type, ...rest }: any) => (
  <input type={type ?? 'text'} value={value} onChange={onChange} data-testid={rest['data-testid']} />
);

export const Switch = ({ value, onChange, ...rest }: any) => (
  <input type="checkbox" checked={!!value} onChange={onChange} data-testid={rest['data-testid']} />
);

export const TextArea = ({ value, onChange, onKeyDown, placeholder, rows, ...rest }: any) => (
  <textarea
    value={value}
    onChange={onChange}
    onKeyDown={onKeyDown}
    placeholder={placeholder}
    rows={rows}
    data-testid={rest['data-testid']}
  />
);

export const useStyles2 = (getStyles: Function) => {
  // Return an identity proxy that returns '' for any property access
  return new Proxy(
    {},
    {
      get: () => '',
    }
  );
};
