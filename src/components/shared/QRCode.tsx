// ============================================================================
// QR Code - Simple visual placeholder for demo
// ============================================================================

import { cn } from '@/lib/utils';

interface QRCodeProps {
  data: string;
  size?: number;
  className?: string;
  label?: string;
}

// Simple deterministic QR-like pattern generator for demo
function generatePattern(data: string, gridSize: number): boolean[][] {
  const grid: boolean[][] = [];
  let seed = 0;
  for (let i = 0; i < data.length; i++) {
    seed = ((seed << 5) - seed + data.charCodeAt(i)) | 0;
  }

  for (let row = 0; row < gridSize; row++) {
    grid[row] = [];
    for (let col = 0; col < gridSize; col++) {
      // Position detection patterns (corners)
      const isCorner =
        (row < 7 && col < 7) ||
        (row < 7 && col >= gridSize - 7) ||
        (row >= gridSize - 7 && col < 7);

      if (isCorner) {
        const isOuter =
          row < 7 && col < 7
            ? row === 0 || row === 6 || col === 0 || col === 6 ||
              (row >= 2 && row <= 4 && col >= 2 && col <= 4)
            : row < 7 && col >= gridSize - 7
            ? row === 0 || row === 6 || col === gridSize - 7 || col === gridSize - 1 ||
              (row >= 2 && row <= 4 && col >= gridSize - 5 && col <= gridSize - 3)
            : row === gridSize - 7 || row === gridSize - 1 || col === 0 || col === 6 ||
              (row >= gridSize - 5 && row <= gridSize - 3 && col >= 2 && col <= 4);
        grid[row][col] = isOuter;
      } else {
        seed = ((seed * 1103515245 + 12345) & 0x7fffffff);
        grid[row][col] = (seed % 3) === 0;
      }
    }
  }
  return grid;
}

export function QRCode({ data, size = 128, className, label }: QRCodeProps) {
  const gridSize = 21; // Standard QR size
  const pattern = generatePattern(data, gridSize);
  const cellSize = size / gridSize;

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <div
        className="bg-white p-2 rounded-lg shadow-sm border border-border"
        style={{ width: size + 16, height: size + 16 }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {pattern.map((row, rowIdx) =>
            row.map((cell, colIdx) =>
              cell ? (
                <rect
                  key={`${rowIdx}-${colIdx}`}
                  x={colIdx * cellSize}
                  y={rowIdx * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill="black"
                />
              ) : null
            )
          )}
        </svg>
      </div>
      {label && (
        <p className="text-xs text-muted-foreground font-mono">{label}</p>
      )}
    </div>
  );
}
