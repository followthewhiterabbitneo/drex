# DREX - Database Real-time EXaminer

A real-time MariaDB monitoring dashboard with speedometer visualizations to identify performance bottlenecks.

## 🏆 DREX IS BADASS! 🏆

We built an AMAZING monitoring system that makes database abuse UNDENIABLE! The speedometer dashboard visually shows when the Call Analytics app hammers the oreka database every ~3 minutes.

## The DREX Suite

### 1. **DREX Speedometer** (`drex-speedometer.js`) ⭐ THE STAR ⭐
- Clean, professional speedometer gauges
- Shows Queries/Second, Connections, Sleeping Connections, Lock Waits
- Needles turn red and SHAKE when hitting danger zones
- Big "QUERY SPIKE DETECTED!" alert for massive spikes
- Run with: `./start-drex.sh`

### 2. **EKG Monitor** (`ekg-monitor.js`)
- Jurassic Park style green phosphor display
- Shows query patterns like a heartbeat monitor
- Proves the periodic nature of spikes
- Run with: `node ekg-monitor.js`

### 3. **EKG Enhanced** (`ekg-enhanced.js`)
- Adds orktag table lock detection
- Shows which users are hogging the database
- Tracks table-specific activity
- Run with: `./start-ekg-enhanced.sh`

### 4. **Smoking Gun Monitor** (`smoking-gun-monitor.js`)
- Focused on proving the 3-minute spike pattern
- Shows baseline vs WHAMMO moments
- Run with: `./start-smoking-gun.sh`

### 5. **Rapid Fire Monitor** (`rapid-spike-monitor.js`)
- Catches spikes every 30 seconds
- Samples twice per second for precision
- Run with: `./start-rapid.sh`

## Database Connection
- Server: `s01vpsoxweb010`
- Database: `oreka`
- User: `DEA`
- Password: `hotchip`

## Deployment
On s01vpsromuls001:
```bash
cd /moneyball/drex
git pull
./start-drex.sh
```

Access dashboard at: http://s01vpsromuls001:3000

## The Problem We're Proving
1. Database runs fine with normal load (even 500 concurrent calls)
2. Every ~3 minutes, Call Analytics queries spike from baseline to 3000-5000 QPS
3. This causes sleeping connections to pile up
4. Lock waits occur when updating the orktag table
5. The visual speedometers make this IMPOSSIBLE to deny!

## Why DREX is Awesome
- **Visual Impact**: Speedometers redlining is way more convincing than log files
- **Real-time**: See problems as they happen
- **Professional**: Clean interface that management can understand
- **Undeniable**: Can't argue with gauges shaking in the red zone!

Built with Node.js, MySQL2, and pure JavaScript. No complex build process needed!