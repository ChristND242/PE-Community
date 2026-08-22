import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { REGISTRATION_REQUEST_NOTE_MAX_LENGTH } from '../registration/registration.types';

export class RegisterDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  password!: string;

  @IsIn(['M', 'F'])
  sex!: 'M' | 'F';

  @IsOptional()
  @IsString()
  @MaxLength(REGISTRATION_REQUEST_NOTE_MAX_LENGTH)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  communityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  inviteToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4_096)
  captchaToken?: string;
}
