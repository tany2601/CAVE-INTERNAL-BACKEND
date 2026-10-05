import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { SessionsService } from './sessions.service.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { CloseSessionDto } from './dto/close-session.dto.js';
import { AssignStylistDto } from './dto/assign-stylist.dto.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';

@ApiTags('Staff Sessions')
@Controller('staff/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start a customer session',
    description:
      'Creates a new customer session on the tablet. Accepts customer name and optional mobile number. If a phone number is provided, loyalty progress is tracked across qualifying completed sessions. Note: Stylist attribution is set separately or optionally provided.',
  })
  @ApiResponse({
    status: 201,
    description: 'Customer session created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or unassigned branch',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: User does not have required role',
  })
  async createSession(@Body() dto: CreateSessionDto, @Req() req: any) {
    return this.sessionsService.createSession(req.user, dto);
  }

  @Get('eligible-stylists')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List eligible active stylists for the authenticated branch',
    description:
      'Lists active staff members belonging to the authenticated branch. Branch-role PIN authentication provides branch level access, while staff selection attributes earnings to individual stylists.',
  })
  @ApiResponse({
    status: 200,
    description: 'Eligible branch stylists retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  async listEligibleStylists(@Req() req: any) {
    return this.sessionsService.listEligibleStylists(req.user);
  }

  @Get('active')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'List active customer sessions for the authenticated branch',
  })
  @ApiResponse({
    status: 200,
    description: 'Active sessions retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  async getActiveSessions(@Req() req: any) {
    return this.sessionsService.getActiveSessions(req.user);
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get session details including customer loyalty, services, and billing',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the session',
    example: 's1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Session details retrieved successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: Cannot access sessions belonging to another branch',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getSessionById(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
  ) {
    return this.sessionsService.getSessionById(req.user, id);
  }

  @Patch(':id/assign-stylist')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Assign an active stylist to a customer session',
    description:
      'Attributes the session to an active staff member belonging to the authenticated branch. Validates that the staff member exists, is active, and is assigned to the same branch.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the active session',
    example: 's1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Stylist assigned to session successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid stylist ID, cross-branch assignment, or inactive session',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: Cannot modify sessions belonging to another branch',
  })
  @ApiResponse({ status: 404, description: 'Session or stylist not found' })
  async assignStylist(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignStylistDto,
    @Req() req: any,
  ) {
    return this.sessionsService.assignStylist(req.user, id, dto);
  }

  @Post(':id/start-service')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Start the service timer for a customer session',
    description:
      'Records the authoritative backend timestamp when the service actually begins.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the active session',
    example: 's1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Service started successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Session is inactive or closed',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: Cannot modify sessions belonging to another branch',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async startService(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
  ) {
    return this.sessionsService.startService(req.user, id);
  }

  @Post(':id/close')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STYLIST', 'MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Close and bill a customer session',
    description:
      'Calculates duration, validates billing details, preserves price snapshots, and increments customer loyalty count atomically. Idempotent: retries will not duplicate transactions or loyalty progress.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the active session to close',
    example: 's1a2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Session closed and billed successfully',
  })
  @ApiResponse({
    status: 400,
    description:
      'Invalid line items, pre-discount amount validation failure, or inactive session',
  })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication token',
  })
  @ApiResponse({
    status: 403,
    description: 'Access denied: Cannot close sessions belonging to another branch',
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async closeSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseSessionDto,
    @Req() req: any,
  ) {
    return this.sessionsService.closeSession(req.user, id, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Edit a billed session (manager only)',
    description:
      'Replaces the services, products, discount, tip and payment mode of a completed session and flags it as edited.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the completed session' })
  async editSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseSessionDto,
    @Req() req: any,
  ) {
    return this.sessionsService.editSession(req.user, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('MANAGER')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete (void) a session (manager only)',
    description:
      'Marks the session CANCELLED so it no longer counts toward revenue, commission or loyalty.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the session' })
  async cancelSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: any,
  ) {
    return this.sessionsService.cancelSession(req.user, id);
  }
}
