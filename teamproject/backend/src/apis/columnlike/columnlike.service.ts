import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Column, Connection, Repository } from 'typeorm';
import { CoachColumn } from '../column/entities/column.entity';
import { User } from '../user/entities/user.entity';
import { ColumnLike, C_LIKE_STATUS_ENUM } from './entities/columnlike.entity';

@Injectable()
export class ColumnlikeService {
  constructor(
    @InjectRepository(ColumnLike)
    private readonly likeRepository: Repository<ColumnLike>,

    @InjectRepository(CoachColumn)
    private readonly columnRepository: Repository<CoachColumn>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly connection: Connection,
  ) {}

  async likeToggle({ columnId, currentUser }) {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const flag = await queryRunner.manager.findOne(
        ColumnLike,
        {
          user: currentUser.id,
          coachColumn: columnId,
        },
        { relations: ['user', 'coachColumn'] },
      );

      console.log('ππππππflagππππππ', flag);
      const user_ = await queryRunner.manager.findOne(User, {
        id: currentUser.id,
      });
      const column_ = await queryRunner.manager.findOne(CoachColumn, {
        id: columnId,
      });

      if (flag === undefined) {
        /**μ²« μ’μμ(/μ«μ΄μ)
         * 1. μ»¨νμΈ (μ»¬λΌ) μ’μμ μ++
         * 2. μ’μμ DB true
         */
        const updColumn = await queryRunner.manager.save(CoachColumn, {
          ...column_,
          likecount: ++column_.likecount,
        });
        const like_ = this.likeRepository.create({
          status: C_LIKE_STATUS_ENUM.COLUMN,
          user: user_,
          coachColumn: updColumn,
          isLike: true,
        });
        const likeRes = await queryRunner.manager.save(like_);
        await queryRunner.commitTransaction();
        return likeRes;
      } else if (!flag.isLike) {
        if (flag.idDislike) {
          /** μ«μ΄μ λλ¦° μν
           * 1. μ»¨νμΈ (μ»¬λΌ) μ«μ΄μ μ --
           * 2. μ»¨νμΈ (μ»¬λΌ) μ’μμ μ ++
           * 3. μ«μ΄μ DB false
           * 4. μ’μμ DB true
           */
          const updColumn = await queryRunner.manager.save(CoachColumn, {
            ...column_,
            likecount: ++column_.likecount,
            dislikecount: --column_.dislikecount,
          });
          const like_ = this.likeRepository.create({
            ...flag,
            user: user_,
            coachColumn: updColumn,
            idDislike: false,
            isLike: true,
          });
          const likeRes = await queryRunner.manager.save(like_);
          await queryRunner.commitTransaction();
          return likeRes;
        } else {
          /** μ’μμ μ·¨μ ν μ’μμ
           * 1. μ»¨νμΈ (μ»¬λΌ) μ’μμ μ ++
           * 2. μ’μμ DB true
           */
          const updColumn = await queryRunner.manager.save(CoachColumn, {
            ...column_,
            likecount: ++column_.likecount,
          });
          const like_ = this.likeRepository.create({
            ...flag,
            user: user_,
            coachColumn: updColumn,
            isLike: true,
          });
          const likeRes = await queryRunner.manager.save(like_);
          await queryRunner.commitTransaction();
          return likeRes;
        }
      } else {
        /** μ’μμ λλ¦° μν
         * 1. μ»¨νμΈ (μ»¬λΌ) μ’μμ --
         * 1. μ’μμ DB false
         */
        const updColumn = await queryRunner.manager.save(CoachColumn, {
          ...column_,
          likecount: --column_.likecount,
        });
        const like_ = this.likeRepository.create({
          ...flag,
          user: user_,
          coachColumn: updColumn,
          isLike: false,
        });
        const undoLikeRes = await queryRunner.manager.save(like_);
        await queryRunner.commitTransaction();
        return undoLikeRes;
      }
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  async dislikeToggle({ columnId, currentUser }) {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const flag = await queryRunner.manager.findOne(
        ColumnLike,
        {
          user: currentUser.id,
          coachColumn: columnId,
        },
        {
          relations: ['user', 'coachColumn', 'coachColumn.user'],
        },
      );
      console.log('π', flag);
      const user_ = await queryRunner.manager.findOne(
        User,
        { id: currentUser.id },
        { relations: ['coachProfile'] },
      );
      console.log('πu', user_);
      const cloumn_ = await queryRunner.manager.findOne(
        CoachColumn,
        { id: columnId },
        { relations: ['user'] },
      );
      console.log('πc', cloumn_);
      if (flag === undefined) {
        //
        console.log('π', '1');
        console.log('');
        const x = await queryRunner.manager.save(CoachColumn, {
          ...cloumn_,
          dislikecount: ++cloumn_.dislikecount,
        });
        console.log(x);
        const dislike_ = this.likeRepository.create({
          status: C_LIKE_STATUS_ENUM.COLUMN,
          user: user_,
          coachColumn: cloumn_,
          idDislike: true,
        });
        console.log(dislike_);
        const dislikeRes = await queryRunner.manager.save(dislike_);
        await queryRunner.commitTransaction();
        return dislikeRes;
        //
      } else if (!flag.idDislike) {
        //
        if (flag.isLike) {
          const x = await queryRunner.manager.save(CoachColumn, {
            ...cloumn_,
            likecount: --cloumn_.likecount,
            dislikecount: ++cloumn_.dislikecount,
          });
          console.log('π', x);
          const dislike_ = this.likeRepository.create({
            ...flag,
            user: user_,
            coachColumn: cloumn_,
            isLike: false,
            idDislike: true,
          });
          const dislikeRes = await queryRunner.manager.save(dislike_);
          await queryRunner.commitTransaction();
          return dislikeRes;
          //
        } else {
          //
          await queryRunner.manager.save(CoachColumn, {
            ...cloumn_,
            dislikecount: ++cloumn_.dislikecount,
          });
          const dislike_ = this.likeRepository.create({
            ...flag,
            user: user_,
            coachColumn: cloumn_,
            idDislike: true,
          });

          const dislikeRes = await queryRunner.manager.save(dislike_);
          await queryRunner.commitTransaction();
          return dislikeRes;
        }
      } else {
        //
        await queryRunner.manager.save(CoachColumn, {
          ...cloumn_,
          dislikecount: --cloumn_.dislikecount,
        });

        const dislike_ = this.likeRepository.create({
          ...flag,
          user: user_,
          coachColumn: cloumn_,
          idDislike: false,
        });

        const dislikeRes = await queryRunner.manager.save(dislike_);
        await queryRunner.commitTransaction();
        return dislikeRes;
      }
    } catch (error) {
      console.log(error);
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }
}
