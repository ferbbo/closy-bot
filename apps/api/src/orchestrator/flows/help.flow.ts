import { Injectable, Logger } from '@nestjs/common';
import { PlaybookService, MerchantPlaybookData } from '../../services/playbook.service';

/**
 * HelpFlow
 * Provides help information and available commands
 * PR-GAP-1: Help message via PlaybookService.getMessage()
 */
@Injectable()
export class HelpFlow {
  private readonly logger = new Logger(HelpFlow.name);

  constructor(private readonly playbookService: PlaybookService) {}

  /**
   * Generate help message from playbook
   *
   * @param merchant - Merchant data (used to resolve playbook messages) [PR-GAP-1]
   * @returns Help message
   */
  async handle(merchant: MerchantPlaybookData): Promise<string> {
    this.logger.debug('Generated help response');
    return this.playbookService.getMessage(merchant, 'helpMenu');
  }
}
