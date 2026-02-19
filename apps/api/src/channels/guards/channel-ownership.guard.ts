import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { PrismaService } from '../../persistence/prisma/prisma.service';

/**
 * Channel Ownership Guard
 * Ensures the authenticated merchant owns the channel in the request params
 * REQ-08: AC-12
 *
 * Usage: Must be used AFTER SessionAuthGuard
 * @UseGuards(SessionAuthGuard, ChannelOwnershipGuard)
 */
@Injectable()
export class ChannelOwnershipGuard implements CanActivate {
  private readonly logger = new Logger(ChannelOwnershipGuard.name);

  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const channelId = request.params.id;
    const merchantId = request.merchant?.id;

    if (!merchantId) {
      // SessionAuthGuard should catch this, but be defensive
      this.logger.error(
        'ChannelOwnershipGuard: No merchant in request (SessionAuthGuard missing?)',
      );
      throw new ForbiddenException('Authentication required');
    }

    if (!channelId) {
      this.logger.error('ChannelOwnershipGuard: No channel ID in params');
      throw new NotFoundException('Channel not found');
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, merchantId: true },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.merchantId !== merchantId) {
      this.logger.warn(
        `Ownership violation: merchant ${merchantId} attempted to access channel ${channelId} owned by ${channel.merchantId}`,
      );
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
