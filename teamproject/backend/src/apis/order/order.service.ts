import {
  ConflictException,
  HttpException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Connection, getRepository, Repository } from 'typeorm';
import { Answer } from '../answer/entities/answer.entity';
import { Question } from '../question/entities/question.entity';
import { User } from '../user/entities/user.entity';
import { OrderHistory, ORDER_STATUS } from './entities/order.entity';

@Injectable()
export class OrderService {
  constructor(
    @InjectRepository(OrderHistory)
    private readonly orderRepository: Repository<OrderHistory>,

    private readonly connection: Connection,
  ) {}

  async create({ currentUser, answerId }) {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const user = await queryRunner.manager.findOne(User, {
        where: { id: currentUser.id },
        relations: ['coachProfile'],
      });
      const answer = await queryRunner.manager.findOne(Answer, {
        where: { id: answerId },
        relations: ['question'],
      });
      const order = await queryRunner.manager.findOne(OrderHistory, {
        where: {
          user: { id: currentUser.id },
          answer: { id: answerId },
        },
        relations: ['user', 'answer'],
      });
      console.log('πuser', user);
      console.log('πanswer', answer);
      console.log('πorder', order);
      console.log('ππππππ', answer.question.id);
      const DidIGotthisQ = await queryRunner.manager.findOne(Question, {
        where: {
          id: answer.question.id,
          toCoach: { id: currentUser.id },
        },
      });
      console.log('πisMine', DidIGotthisQ);
      if (DidIGotthisQ) {
        return new ConflictException(`${user.name} μ½μΉλμ λ΅λ³μλλ€`);
      }

      if (user.point < answer.amount) {
        return new UnprocessableEntityException(
          'ν¬μΈνΈ μμ‘μ΄ μΆ©λΆνμ§ μμ΅λλ€.',
        );
      }

      if (order) {
        return new ConflictException('μ΄λ―Έ κ΅¬λ§€νμ  λ΅λ³ λ΄μ©μλλ€.');
      }

      const minusUser = await queryRunner.manager.save(User, {
        ...user,
        point: user.point - answer.amount,
      });
      console.log('πuserpoint--', minusUser);

      const createOrder = this.orderRepository.create({
        user: minusUser,
        answer,
        amount: answer.amount,
        status: ORDER_STATUS.PAYMENT,
      });
      console.log('πcreatedOrder', createOrder);
      const res = await queryRunner.manager.save(createOrder);
      console.log('πres', res);
      await queryRunner.commitTransaction();
      return res;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(error.response.message, error.status);
    } finally {
      await queryRunner.release();
    }
  }

  async cancel({ userId, answerId }) {
    const queryRunner = this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const order = await queryRunner.manager.findOne(OrderHistory, {
        where: {
          user: { id: userId },
          answer: { id: answerId },
        },
        relations: ['user', 'answer'],
      });
      console.log('π', order);
      if (order.status === 'CANCEL') {
        return new ConflictException('μ΄λ―Έ μ·¨μλ κ²°μ κ±΄μλλ€.');
      }
      if (order.status !== 'PAYMENT') {
        return new ConflictException('κ΅¬λ§€ λ΄μ­μ΄ μμ΅λλ€.');
      }

      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
        relations: ['coachProfile'],
      });
      console.log('πuser', user);

      const cancel = await queryRunner.manager.save(OrderHistory, {
        user,
        answer: order.answer,
        amount: -order.amount,
        status: ORDER_STATUS.CANCEL,
      });
      console.log('π---c', cancel);

      const x = await queryRunner.manager.save(User, {
        ...user,
        point: Number(user.point) - Number(cancel.amount),
      });
      console.log('πuser++', x);
      await queryRunner.commitTransaction();
      return cancel;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw new HttpException(error.response.message, error.status);
    } finally {
      await queryRunner.release();
    }
  }
}
