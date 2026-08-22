import { Body, Controller, Get, Headers, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { maxAvatarUploadSize, type AvatarUploadFile } from '../uploads';
import { SetupRequestDto } from './setup.dto';
import { SetupService } from './setup.service';

@Controller(['setup', 'api/v1/setup'])
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  status() {
    return this.setup.status();
  }

  @Post()
  @UseInterceptors(FileInterceptor('ownerAvatar', { limits: { fileSize: maxAvatarUploadSize } }))
  initialize(
    @Body() body: SetupRequestDto,
    @Headers('x-setup-token') setupTokenHeader?: string,
    @UploadedFile() ownerAvatar?: AvatarUploadFile,
  ) {
    return this.setup.initialize({ ...body, setupToken: body.setupToken ?? setupTokenHeader }, ownerAvatar);
  }
}
