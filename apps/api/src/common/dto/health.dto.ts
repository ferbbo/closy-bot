import { IsIn, IsString, IsNumber } from 'class-validator';

export class HealthResponseDto {
  @IsIn(['ok', 'error'])
  status!: 'ok' | 'error';

  @IsString()
  timestamp!: string;
}

export class DbHealthResponseDto extends HealthResponseDto {
  @IsNumber()
  latency!: number;
}
