import { useState, useEffect } from 'preact/hooks';
import { Speedometer } from './components/Speedometer';
import './app.css';

// Mock data - replace with real API calls later
interface DBMetrics {
  connections: number;
  threads: number;
  deniedAttempts: number;
  queryRate: number;
}

export function App() {
  const [metrics, setMetrics] = useState<DBMetrics>({
    connections: 45,
    threads: 12,
    deniedAttempts: 3,
    queryRate: 150
  });

  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics({
        connections: Math.floor(Math.random() * 100),
        threads: Math.floor(Math.random() * 50),
        deniedAttempts: Math.floor(Math.random() * 20),
        queryRate: Math.floor(Math.random() * 300)
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="app">
      <h1>DREX - Database Real-time EXaminer</h1>
      <p>MariaDB 5.5.68 Performance Monitor</p>
      
      <div className="dashboard">
        <Speedometer 
          value={metrics.connections} 
          max={100} 
          label="Active Connections"
          danger={80}
          warning={60}
        />
        <Speedometer 
          value={metrics.threads} 
          max={50} 
          label="Running Threads"
          danger={40}
          warning={30}
        />
        <Speedometer 
          value={metrics.deniedAttempts} 
          max={20} 
          label="Denied Attempts"
          danger={10}
          warning={5}
        />
        <Speedometer 
          value={metrics.queryRate} 
          max={300} 
          label="Queries/sec"
          danger={250}
          warning={200}
        />
      </div>

      <div className="status">
        <p>Last Update: {new Date().toLocaleTimeString()}</p>
      </div>
    </div>
  );
}
