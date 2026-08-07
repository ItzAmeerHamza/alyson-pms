import { ArrayMinSize, IsArray, IsString } from 'class-validator';

export class CreateAccessGrantDto {
  @IsString()
  grantee_user_id!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  target_user_ids!: string[];
}

export class UpdateAccessGrantDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  target_user_ids!: string[];
}
