import {
  ConflictException,
  Injectable,
  CACHE_MANAGER,
  Inject,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Connection, getRepository, Repository } from 'typeorm';
import { MainStack } from '../mainstack/entities/mainstack.entity';
import { User } from './entities/user.entity';
import { Cache } from 'cache-manager';
import { CoachProfile } from '../coach/entities/coachprofile.entity';
import { Storage } from '@google-cloud/storage';
import { FileUpload } from 'graphql-upload';

interface IFile {
  files: FileUpload[];
}
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(MainStack)
    private readonly mainstackRepository: Repository<MainStack>,

    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,

    @InjectRepository(CoachProfile)
    private readonly coachprofilerepository: Repository<CoachProfile>,

    private readonly connection: Connection,
  ) {}

  async findAll() {
    return await getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainstack', 'mainstack')
      .leftJoinAndSelect('user.coachtag', 'coachtag')
      .leftJoinAndSelect('user.coachProfile', 'coachProfile')
      .orderBy('user.createdAt', 'DESC')
      .getMany();
  }

  async findUserOrderbyscore() {
    return await getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainstack', 'mainstack')
      .leftJoinAndSelect('user.coachtag', 'coachtag')
      .leftJoinAndSelect('user.coachProfile', 'coachProfile')
      .orderBy('user.score', 'DESC')
      .getMany();
  }

  async findusersearch({ search }) {
    return await getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainstack', 'mainstack')
      .leftJoinAndSelect('user.coachtag', 'coachtag')
      .leftJoinAndSelect('user.coachProfile', 'coachProfile')
      .where('user.name like :name', { name: '%' + search + '%' })
      .orWhere('user.nickname like :nickname', { nickname: '%' + search + '%' })
      .orderBy('user.score', 'DESC')
      .getMany();
  }

  async fetchmainstack({ currentUser }) {
    const mainstack = await this.userRepository.findOne({
      where: { id: currentUser.id },
      relations: ['mainstack'],
    });
    delete mainstack.mainstack.id;

    const bestmainstack = Object.values(mainstack.mainstack);
    const max = Math.max(...bestmainstack);
    if (max === 0) return 'no';
    for (const key in mainstack.mainstack) {
      if (mainstack.mainstack[key] === max) {
        return key;
      }
    }
  }

  async fetchmyuser({ currentUser }) {
    return await getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainstack', 'mainstack')
      .leftJoinAndSelect('user.coachtag', 'coachtag')
      .leftJoinAndSelect('user.coachProfile', 'coachProfile')
      .where('user.id = :id', { id: currentUser.id })
      .getOne();
  }

  async create({ email, hashedPassword, phonenumber, name, nickname }) {
    const result1 = await this.userRepository.findOne({
      email: email,
    });

    if (result1) throw new ConflictException('?????? ????????? ??????????????????');
    const coachProfile = await this.coachprofilerepository.save({});

    const mainstack = await this.mainstackRepository.save({});

    return await this.userRepository.save({
      email,
      password: hashedPassword,
      phonenumber,
      name,
      nickname,
      coachProfile,
      mainstack,
    });
  }
  async socailcreate({ password, email, name }) {
    const result1 = await this.userRepository.findOne({
      email: email,
    });

    if (result1) throw new ConflictException('?????? ????????? ??????????????????');
    return await this.userRepository.save({
      password,
      email,
      name,
      nickname: name,
    });
  }

  async findemail({ email }) {
    return await this.userRepository.findOne({ email });
  }

  async updateUser({
    hashedPassword,
    phonenumber,
    name,
    nickname,
    currentUser,
  }) {
    const User = await this.userRepository.findOne({
      email: currentUser.email,
    });
    const password = hashedPassword;
    const newUser = { ...User, password, phonenumber, name, nickname };
    return await this.userRepository.save(newUser);
  }

  async delete({ currentUser }) {
    const { email, ...rest } = currentUser;
    const result = await this.userRepository.softDelete({ email });
    return result.affected ? true : false;
  }

  async sendTokenTOSMS({ phonenumber }) {
    const token = String(Math.floor(Math.random() * 10 ** 6)).padStart(6, '0');

    const appKeys = process.env.SMS_APP_KEY;
    const XSecretKey = process.env.SMS_X_SECRET_KEY;
    const sender = phonenumber;
    await axios.post(
      `https://api-sms.cloud.toast.com/sms/v3.0/appKeys/${appKeys}/sender/sms`,
      {
        body: `???????????????. ??????????????? ${token}?????????`,
        sendNo: '01065474238',
        recipientList: [
          {
            internationalRecipientNo: sender,
          },
        ],
      },
      {
        headers: {
          'X-Secret-Key': XSecretKey,
          'Content-Type': 'application/json;charset=UTF-8',
        },
      },
    );
    const redistoken = await this.cacheManager.get(phonenumber);
    if (redistoken) await this.cacheManager.del(phonenumber);
    await this.cacheManager.set(phonenumber, token, {
      ttl: 180,
    });
    return `${phonenumber} ?????? ${token}??? ??????????????????`;
  }

  async checktoken({ phonenumber, token }) {
    const redistoken = await this.cacheManager.get(phonenumber);

    if (redistoken === token) {
      await this.cacheManager.del(phonenumber);
      return true;
    }

    return false;
  }

  async plususerscore({ score, currentUser }) {
    const queryRunner = await this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const user = await queryRunner.manager.findOne(
        User,
        { id: currentUser.id },
        { lock: { mode: 'pessimistic_write' } },
      );

      const result = await queryRunner.manager.save(User, {
        ...user,
        score: user.score + score,
      });

      await queryRunner.commitTransaction();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  async minususerscore({ score, currentUser }) {
    const queryRunner = await this.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('SERIALIZABLE');

    try {
      const user = await queryRunner.manager.findOne(
        User,
        { id: currentUser.id },
        { lock: { mode: 'pessimistic_write' } },
      );

      const result = await queryRunner.manager.save(User, {
        ...user,
        score: user.score - score,
      });

      await queryRunner.commitTransaction();

      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
    } finally {
      await queryRunner.release();
    }
  }

  async fetchuserbypage({ page, perpage }) {
    if (!page) page = 0;
    if (!perpage) perpage = 10;

    return await getRepository(User)
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.mainstack', 'mainstack')
      .leftJoinAndSelect('user.coachtag', 'coachtag')
      .leftJoinAndSelect('user.coachProfile', 'coachProfile')
      .orderBy('user.score', 'DESC')
      .skip(page * perpage)
      .take(perpage)
      .getMany();
  }

  async fetchisnicknameuser({ nickname }) {
    const isnickname = await this.userRepository.find({
      where: {
        nickname: nickname,
      },
    });

    if (isnickname) return true;
    return false;
  }

  async usernulliddelete() {
    const result = await this.userRepository.softDelete({ id: null });
    return result.affected ? true : false;
  }

  async upload({ files }: IFile) {
    const storage = new Storage({
      keyFilename: 'cu2project-346112-d5421f4b1c03.json',
      projectId: 'cu2project-346112',
    }).bucket('cu2project-backend');

    const waitedfile = await Promise.all(files);

    const results = await Promise.all(
      waitedfile.map((file, i) => {
        return new Promise((resolve, reject) => {
          file
            .createReadStream()
            .pipe(
              storage.file(`thumb/${i}/${file.filename}`).createWriteStream(),
            )
            .on('finish', () => resolve(`thumb/${i}/${file.filename}`))
            .on('error', (error) => reject(error));
        });
      }),
    );
    return results;
  }
}
