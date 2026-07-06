/**
 * Breadcrumb overlay showing current drill scope.
 *
 * Displays: environment / namespace / service
 * Clicking a segment clears deeper segments (re-sets dashboard vars).
 * Uses locationService.partial to update URL variables.
 */

import React from 'react';
import { locationService } from '@grafana/runtime';
import { css } from '@emotion/css';

export interface BreadcrumbProps {
  /** Current environment from replaceVariables('${environment}'). */
  environment: string;
  /** Current namespace from replaceVariables('${namespace}'). */
  namespace: string;
  /** Current service from replaceVariables('${service}'). */
  service: string;
  /** Theme colors for styling. */
  textColor: string;
  bgColor: string;
  borderColor: string;
  linkColor: string;
}

/**
 * Lightweight breadcrumb overlay showing current scope.
 * Positioned top-left of the panel.
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  environment,
  namespace,
  service,
  textColor,
  bgColor,
  borderColor,
  linkColor,
}) => {
  // Don't render if no scope is set (all default/$__all)
  const hasScope =
    (environment && environment !== '$__all') ||
    (namespace && namespace !== '$__all') ||
    (service && service !== '$__all');

  if (!hasScope) {
    return null;
  }

  const handleServiceClick = () => {
    // Clear service → back to namespace view
    locationService.partial({ 'var-service': '$__all' });
  };

  const handleNamespaceClick = () => {
    // Clear namespace + service
    locationService.partial({ 'var-namespace': '$__all', 'var-service': '$__all' });
  };

  const isServiceActive = service && service !== '$__all';
  const isNamespaceActive = namespace && namespace !== '$__all';
  const isEnvActive = environment && environment !== '$__all';

  return (
    <div
      data-testid="drill-breadcrumb"
      className={css`
        position: absolute;
        top: 8px;
        left: 8px;
        z-index: 5;
        display: flex;
        align-items: center;
        gap: 0;
        font-size: 11px;
        font-family: sans-serif;
        padding: 4px 8px;
        border-radius: 4px;
        background: ${bgColor};
        border: 1px solid ${borderColor};
        color: ${textColor};
        pointer-events: auto;
      `}
    >
      {isEnvActive && (
        <span data-testid="breadcrumb-env">{environment}</span>
      )}
      {isNamespaceActive && (
        <>
          <span className={css`margin: 0 4px; opacity: 0.5;`}>/</span>
          <span
            data-testid="breadcrumb-namespace"
            onClick={handleNamespaceClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleNamespaceClick(); } }}
            className={css`
              cursor: pointer;
              color: ${linkColor};
              &:hover { text-decoration: underline; }
            `}
          >
            {namespace}
          </span>
        </>
      )}
      {isServiceActive && (
        <>
          <span className={css`margin: 0 4px; opacity: 0.5;`}>/</span>
          <span
            data-testid="breadcrumb-service"
            onClick={handleServiceClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleServiceClick(); } }}
            className={css`
              cursor: pointer;
              color: ${linkColor};
              font-weight: 500;
              &:hover { text-decoration: underline; }
            `}
          >
            {service}
          </span>
        </>
      )}
    </div>
  );
};
