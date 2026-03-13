import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth.js';
import { metricsRepository } from '../repositories/metrics.js';
import { isDatabaseUnavailableError } from '../repositories/errors.js';

export const kpisRouter = Router();

// Require analyst or admin role to view KPIs
kpisRouter.use(authenticateRequest);
kpisRouter.use(requireRole('analyst', 'admin'));

kpisRouter.get('/', async (req, res) => {
  try {
    const kpis = await metricsRepository.getDashboardKPIs();
    res.json(kpis);
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    console.error('Error fetching KPIs', error);
    res.status(500).json({ error: 'Failed to fetch KPIs' });
  }
});
