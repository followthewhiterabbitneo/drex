# DREX - Database Real-time EXaminer

A real-time MariaDB monitoring dashboard with speedometer visualizations to identify performance bottlenecks.

## Quick Context for Claude
When I say "drex", I'm referring to this MariaDB monitoring dashboard project that:
- Shows real-time database metrics via speedometer gauges
- Helps troubleshoot a MariaDB 5.5.68 instance being hammered by an in-house app
- Built with Preact + TypeScript + Vite
- Deployed via GitHub Actions pipeline

## Current Focus
Building a visual monitoring tool to prove database load issues affecting our call recording system.

## Key Metrics to Monitor
1. Active connections (speedometer 1)
2. Running threads (speedometer 2)  
3. Denied attempts (speedometer 3)
4. Query rate (speedometer 4)

## See CLAUDE.local.md for detailed implementation notes