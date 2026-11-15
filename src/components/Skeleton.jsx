import React from 'react';

export function SkeletonRows({ count = 3 }) {
  return (
    <div className="skeleton-list" aria-busy="true" aria-label="Loading polls from Sepolia">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <span className="sk sk-short" />
          <span className="sk sk-title" />
          <span className="sk sk-line" />
          <span className="sk sk-line" />
        </div>
      ))}
    </div>
  );
}
