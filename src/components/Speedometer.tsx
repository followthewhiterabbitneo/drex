import { useEffect, useRef } from 'preact/hooks';

interface SpeedometerProps {
  value: number;
  max: number;
  label: string;
  danger?: number;
  warning?: number;
}

export function Speedometer({ value, max, label, danger = max * 0.8, warning = max * 0.6 }: SpeedometerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 80;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw outer arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 20;
    ctx.stroke();

    // Calculate angle for value
    const percentage = Math.min(value / max, 1);
    const angle = Math.PI * 0.75 + (Math.PI * 1.5 * percentage);

    // Draw colored arc based on value
    let color = '#4CAF50'; // green
    if (value >= danger) color = '#F44336'; // red
    else if (value >= warning) color = '#FF9800'; // orange

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI * 0.75, angle);
    ctx.strokeStyle = color;
    ctx.lineWidth = 20;
    ctx.stroke();

    // Draw needle
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -radius + 10);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();

    // Draw center dot
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();

    // Draw value text
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000';
    ctx.fillText(value.toString(), centerX, centerY + 40);

    // Draw label
    ctx.font = '14px Arial';
    ctx.fillText(label, centerX, centerY + 60);

  }, [value, max, danger, warning, label]);

  return (
    <div style={{ display: 'inline-block', margin: '10px' }}>
      <canvas ref={canvasRef} width={200} height={200} />
    </div>
  );
}