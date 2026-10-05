import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminChecklistService } from './admin-checklist.service.js';
import { CreateChecklistTaskDto, UpdateChecklistTaskDto } from './admin-checklist.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Admin Checklist')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('admin/checklist')
export class AdminChecklistController {
  constructor(private readonly service: AdminChecklistService) {}

  @Get()
  @ApiOperation({ summary: 'Daily checklist template' })
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a checklist task' })
  create(@Body() dto: CreateChecklistTaskDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename / re-describe a checklist task' })
  update(@Param('id', new ParseUUIDPipe()) id: string, @Body() dto: UpdateChecklistTaskDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a checklist task' })
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.service.remove(id);
  }
}
