import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StripeCatalogService } from '../stripe-catalog.service';

function createStripeMock() {
  return {
    prices: {
      list: vi.fn(),
      retrieve: vi.fn(),
    },
  };
}

describe('StripeCatalogService', () => {
  let stripeMock: ReturnType<typeof createStripeMock>;
  let service: StripeCatalogService;

  beforeEach(() => {
    stripeMock = createStripeMock();
    service = new StripeCatalogService(stripeMock as never);
  });

  it('rejects checkout when a monthly lookup key points to a yearly price', async () => {
    stripeMock.prices.list.mockResolvedValue({
      data: [
        {
          id: 'price_pro_monthly_bad',
          lookup_key: 'pro_monthly',
          unit_amount: 2900,
          recurring: {
            interval: 'year',
          },
        },
        {
          id: 'price_pro_annual_good',
          lookup_key: 'pro_annual',
          unit_amount: 24000,
          recurring: {
            interval: 'year',
          },
        },
      ],
    });

    await expect(
      service.resolveCheckoutPriceId('pro', 'monthly'),
    ).rejects.toThrow(
      'Stripe price price_pro_monthly_bad for lookup key pro_monthly must recur month, got year',
    );
  });

  it('retrieves archived prices by id when webhook price ids are not in the active catalog', async () => {
    stripeMock.prices.list.mockResolvedValue({
      data: [
        {
          id: 'price_pro_monthly_current',
          lookup_key: 'pro_monthly',
          unit_amount: 2900,
          recurring: {
            interval: 'month',
          },
        },
        {
          id: 'price_pro_annual_current',
          lookup_key: 'pro_annual',
          unit_amount: 24000,
          recurring: {
            interval: 'year',
          },
        },
      ],
    });
    stripeMock.prices.retrieve.mockResolvedValue({
      id: 'price_pro_monthly_archived',
      active: false,
      lookup_key: 'pro_monthly',
      unit_amount: 2900,
      recurring: {
        interval: 'month',
      },
    });

    await expect(
      service.resolveTierFromPrice({
        id: 'price_pro_monthly_archived',
        lookup_key: null,
        unit_amount: 2900,
        recurring: {
          interval: 'month',
        },
      } as never),
    ).resolves.toBe('pro');

    expect(stripeMock.prices.retrieve).toHaveBeenCalledWith(
      'price_pro_monthly_archived',
    );
  });
});
