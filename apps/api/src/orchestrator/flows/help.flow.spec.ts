import { Test, TestingModule } from '@nestjs/testing';
import { HelpFlow } from './help.flow';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';
import { PlaybookMessages } from '../../domain/entities/playbook-config.interface';
import { GenericPlaybookDefaults } from '../../domain/entities/playbook-defaults/generic.config';

/**
 * HelpFlow Unit Tests
 * PR-GAP-1 AC-05: HelpFlow NO tiene strings hardcoded, usa getMessage()
 * Evidence for AC-05: HelpFlow.handle() calls PlaybookService.getMessage(merchant, 'helpMenu')
 */
describe('AC-05: HelpFlow uses PlaybookService.getMessage() (PR-GAP-1)', () => {
  let flow: HelpFlow;
  let playbookService: jest.Mocked<PlaybookService>;

  const mockMerchant: MerchantPlaybookData = { id: 'merchant-1', name: 'TestMerchant' };

  beforeEach(async () => {
    const mockGetMessage = jest
      .fn()
      .mockImplementation(
        (
          merchant: MerchantPlaybookData,
          key: keyof PlaybookMessages,
          placeholders?: Record<string, string | number>,
        ) => {
          let template: string = GenericPlaybookDefaults.messages[key] ?? String(key);
          if (placeholders) {
            for (const [k, v] of Object.entries(placeholders)) {
              template = template.replace(`{${k}}`, String(v));
            }
          }
          return template;
        },
      );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HelpFlow,
        {
          provide: PlaybookService,
          useValue: {
            getMessage: mockGetMessage,
          },
        },
      ],
    }).compile();

    flow = module.get<HelpFlow>(HelpFlow);
    playbookService = module.get(PlaybookService);
  });

  it('AC-05: handle() calls getMessage(merchant, "helpMenu") — no hardcode', async () => {
    const response = await flow.handle(mockMerchant);

    expect(typeof response).toBe('string');
    expect(response.length).toBeGreaterThan(0);
    // AC-05: getMessage called with 'helpMenu' key — no hardcoded string
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'helpMenu');
    expect(playbookService.getMessage).toHaveBeenCalledTimes(1);
  });

  it('AC-05: handle() returns helpMenu message content from GenericPlaybookDefaults', async () => {
    const response = await flow.handle(mockMerchant);

    // Default helpMenu contains typical help text
    expect(response).toBe(GenericPlaybookDefaults.messages.helpMenu);
  });

  it('AC-05: handle() returns custom helpMenu when merchant has custom config', async () => {
    const customHelpMenu = 'Menú personalizado: escribe ayuda';
    (playbookService.getMessage as jest.Mock).mockReturnValueOnce(customHelpMenu);

    const response = await flow.handle(mockMerchant);

    expect(response).toBe(customHelpMenu);
    expect(playbookService.getMessage).toHaveBeenCalledWith(mockMerchant, 'helpMenu');
  });
});
