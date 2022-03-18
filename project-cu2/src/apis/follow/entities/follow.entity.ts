import { Field, ObjectType } from '@nestjs/graphql';
import { createSecureServer } from 'http2';
import { User } from 'src/apis/user/entities/user.entity';
import { Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
@ObjectType()
export class Follow {
  @PrimaryGeneratedColumn('uuid')
  @Field(() => String)
  id: string;

  @ManyToOne(() => User)
  @Field(() => User)
  fromUserId: User;

  @Column()
  @Field(() => String)
  toUserId: string;

  //설정값? relate?
}
