import { useState, useEffect } from 'preact/hooks';
import './RedlineMonitor.css';

interface RedlineProps {
  locks: number;
  connections: number;
  queryRate: number;
  maxHistory?: number;
}

export function RedlineMonitor({ locks, connections, queryRate, maxHistory = 60 }: RedlineProps) {
  const [history, setHistory] = useState<number[]>([]);
  const [peakLocks, setPeakLocks] = useState(0);
  
  // Determine if we're redlining
  const isRedlining = locks > 10 || connections > 80 || queryRate > 250;
  const severity = locks > 20 ? 'critical' : locks > 10 ? 'severe' : 'warning';
  
  useEffect(() => {
    // Track history
    setHistory(prev => [...prev.slice(-maxHistory + 1), locks]);
    
    // Track peak
    if (locks > peakLocks) {
      setPeakLocks(locks);
    }
  }, [locks]);

  return (
    <div className={`redline-monitor ${isRedlining ? `redlining ${severity}` : ''}`}>
      {isRedlining && (
        <>
          <div className="redline-header">
            <h2>🚨 SYSTEM REDLINING!</h2>
            <div className="redline-stats">
              <span>LOCKS: {locks}</span>
              <span>CONNECTIONS: {connections}</span>
              <span>QPS: {queryRate}</span>
            </div>
          </div>
          
          <div className="redline-message">
            {locks > 20 && (
              <p className="critical-message">
                CRITICAL: {locks} QUERIES LOCKED! 
                <br/>DATABASE PERFORMANCE SEVERELY DEGRADED!
              </p>
            )}
            {locks > 10 && locks <= 20 && (
              <p className="severe-message">
                SEVERE: Application causing massive lock contention!
                <br/>Users experiencing significant delays!
              </p>
            )}
          </div>
          
          <div className="peak-tracker">
            <span>Session Peak: {peakLocks} locks</span>
            <span>Average: {Math.round(history.reduce((a, b) => a + b, 0) / history.length)}</span>
          </div>
        </>
      )}
      
      {!isRedlining && locks > 5 && (
        <div className="warning-zone">
          ⚠️ Warning: Lock count rising ({locks} active)
        </div>
      )}
    </div>
  );
}