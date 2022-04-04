import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import User from 'src/api/users/entities/user.entity';

export class CreateChannelDTO {
  @IsString()
  @IsNotEmpty()
  @IsDefined()
  readonly name: string;

  @IsBoolean()
  readonly isPrivate?: boolean | false;

  @IsBoolean()
  readonly isProtected?: boolean | false;

  @IsString()
  readonly password?: string | null;

  @IsNotEmpty()
  @IsDefined()
  readonly owner: User;

  @IsArray()
  @IsNotEmpty()
  @IsOptional()
  readonly admins?: User[];

  @IsArray()
  @IsNotEmpty()
  @IsDefined()
  readonly members: User[];

  @ApiProperty({ required: false })
  @IsArray()
  @IsNotEmpty()
  @IsOptional()
  readonly mutes?: User[];

  @ApiProperty({ required: false })
  @IsArray()
  @IsNotEmpty()
  @IsOptional()
  readonly bans?: User[];

  @ApiProperty({ required: false })
  @IsArray()
  @IsNotEmpty()
  @IsOptional()
  readonly invites?: User[];
}
