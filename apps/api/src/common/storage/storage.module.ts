import { Module } from '@nestjs/common';

import { ReceiptStorageService } from './receipt-storage.service';

@Module({
  providers: [ReceiptStorageService],
  exports: [ReceiptStorageService],
})
export class StorageModule {}
