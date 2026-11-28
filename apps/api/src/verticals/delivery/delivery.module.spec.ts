import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DeliveryModule } from './delivery.module';
import { VerticalRouterService } from '../vertical-router.service';
import { FeatureFlagsService } from '../../common/feature-flags/feature-flags.service';

describe('DeliveryModule (S1.1-T3 compile/boot)', () => {
  it('compiles and exposes the shared VerticalRouterService and flags', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ FEATURES_MODE: 'mvp' })],
        }),
        DeliveryModule,
      ],
    }).compile();

    expect(moduleRef.get(DeliveryModule)).toBeDefined();
    expect(moduleRef.get(VerticalRouterService, { strict: false })).toBeInstanceOf(
      VerticalRouterService,
    );
    expect(moduleRef.get(FeatureFlagsService, { strict: false }).isDeliveryEnabled).toBe(false);
    await moduleRef.close();
  });
});
