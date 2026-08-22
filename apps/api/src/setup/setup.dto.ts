import { IsOptional, IsString } from 'class-validator';

export class SetupRequestDto {
  @IsString()
  communityName!: string;

  @IsString()
  communitySlug!: string;

  @IsString()
  ownerFullName!: string;

  @IsString()
  ownerEmail!: string;

  @IsString()
  ownerPassword!: string;

  @IsString()
  defaultLanguage!: string;

  @IsString()
  timezone!: string;

  @IsOptional()
  @IsString()
  setupToken?: string;

  @IsOptional()
  @IsString()
  ownerAvatarStyle?: string;

  @IsOptional()
  @IsString()
  ownerAvatarSeed?: string;
}
