import { Router } from 'express';
import { authenticateRequest, requireRole } from '../auth.js';
import { metricsRepository } from '../repositories/metrics.js';
export const kpisRouter = Router();
// Require analyst or admin role to view KPIs
kpisRouter.use(authenticateRequest);
kpisRouter.use(requireRole('analyst', 'admin'));
kpisRouter.get('/', async (req, res) => {
    try {
        const kpis = await metricsRepository.getDashboardKPIs();
        res.json(kpis);
    }
    catch (error) {
        console.error('Error fetching KPIs', error);
        res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
});
//# sourceMappingURL=kpis.js.map