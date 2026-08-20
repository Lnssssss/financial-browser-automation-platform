import { IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  username!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  // 这里做成可选，默认 DEMO_BANK，既保留多租户能力又不让 demo 登录变复杂。
  @IsOptional()
  @IsString()
  orgCode?: string;
}
