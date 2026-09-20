import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';

interface TermsModalProps {
  isOpen: boolean;
  termsType: 'terms' | 'privacy';
  onClose: () => void;
}

const TermsModal: React.FC<TermsModalProps> = ({ isOpen, termsType, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showClose={true}
        className="max-w-[600px] w-full max-h-[80vh] flex flex-col max-[480px]:max-h-[90vh] p-0 gap-0"
      >
        <DialogHeader className="px-7 py-6 border-b border-border max-[480px]:p-5 text-left">
          <DialogTitle className="text-2xl max-[480px]:text-xl">
            {termsType === 'terms' ? '이용약관' : '개인정보처리방침'}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto p-7 text-foreground leading-[1.8] max-[480px]:p-5 [&_h3]:text-foreground [&_h3]:text-[1.1rem] [&_h3]:font-bold [&_h3]:mt-7 [&_h3]:mb-3 [&_h3]:pt-2 [&_h3:first-child]:mt-0 [&_p]:my-2 [&_p]:text-[0.95rem] [&_p]:text-muted-foreground [&_p]:leading-[1.7] max-[480px]:[&_h3]:text-base max-[480px]:[&_p]:text-[0.9rem]">
          {termsType === 'terms' ? (
            <>
              <h3>제1조 (목적)</h3>
              <p>본 약관은 CodeRecall(이하 "서비스")의 이용과 관련하여 서비스와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>

              <h3>제2조 (정의)</h3>
              <p>1. "서비스"란 CodeRecall가 제공하는 학습 관리 및 플래시카드 서비스를 의미합니다.</p>
              <p>2. "이용자"란 본 약관에 따라 서비스를 이용하는 회원을 말합니다.</p>
              <p>3. "회원"이란 서비스에 접속하여 본 약관에 따라 서비스를 이용하는 고객을 말합니다.</p>

              <h3>제3조 (약관의 명시와 개정)</h3>
              <p>1. 서비스는 본 약관의 내용을 이용자가 쉽게 알 수 있도록 서비스 초기 화면에 게시합니다.</p>
              <p>2. 서비스는 필요한 경우 관련 법령을 위배하지 않는 범위에서 본 약관을 개정할 수 있습니다.</p>

              <h3>제4조 (서비스의 제공)</h3>
              <p>1. 서비스는 다음과 같은 업무를 수행합니다:</p>
              <p>   - GitHub 저장소 연동을 통한 학습 내용 관리</p>
              <p>   - 플래시카드 기반 학습 서비스</p>
              <p>   - 학습 알림 서비스</p>
              <p>2. 서비스는 연중무휴, 1일 24시간 제공함을 원칙으로 합니다.</p>

              <h3>제5조 (서비스의 중단)</h3>
              <p>서비스는 컴퓨터 등 정보통신설비의 보수점검, 교체 및 고장, 통신의 두절 등의 사유가 발생한 경우에는 서비스의 제공을 일시적으로 중단할 수 있습니다.</p>

              <h3>제6조 (회원가입)</h3>
              <p>1. 이용자는 GitHub 계정을 통해 회원가입을 신청합니다.</p>
              <p>2. 서비스는 제1항과 같이 회원으로 가입할 것을 신청한 이용자 중 다음 각 호에 해당하지 않는 한 회원으로 등록합니다:</p>
              <p>   - 이전에 회원자격을 상실한 적이 있는 경우</p>
              <p>   - 실명이 아니거나 타인의 명의를 이용한 경우</p>

              <h3>제7조 (회원 탈퇴 및 자격 상실)</h3>
              <p>1. 회원은 서비스에 언제든지 탈퇴를 요청할 수 있으며 서비스는 즉시 회원탈퇴를 처리합니다.</p>
              <p>2. 회원탈퇴 후 24시간 동안은 재가입이 제한됩니다.</p>

              <h3>제8조 (개인정보보호)</h3>
              <p>서비스는 관련 법령이 정하는 바에 따라 회원의 개인정보를 보호하기 위해 노력합니다. 개인정보의 보호 및 사용에 대해서는 관련 법령 및 서비스의 개인정보처리방침이 적용됩니다.</p>

              <h3>제9조 (서비스의 면책)</h3>
              <p>1. 서비스는 천재지변 또는 이에 준하는 불가항력으로 인하여 서비스를 제공할 수 없는 경우에는 서비스 제공에 관한 책임이 면제됩니다.</p>
              <p>2. 서비스는 회원의 귀책사유로 인한 서비스 이용의 장애에 대하여는 책임을 지지 않습니다.</p>
            </>
          ) : (
            <>
              <h3>1. 개인정보의 수집 및 이용 목적</h3>
              <p>CodeRecall는 다음의 목적을 위하여 개인정보를 처리합니다:</p>
              <p>- 회원 가입 및 관리: GitHub 계정 정보를 통한 본인 확인</p>
              <p>- 서비스 제공: GitHub 저장소 연동 및 학습 콘텐츠 관리</p>
              <p>- 알림 서비스: 학습 알림 제공</p>

              <h3>2. 수집하는 개인정보의 항목</h3>
              <p>서비스는 다음의 개인정보를 수집합니다:</p>
              <p>- 필수항목: GitHub 사용자 ID, 이메일 주소, 프로필 사진, GitHub OAuth 토큰, GitHub 저장소 정보</p>
              <p>- 자동수집항목: 서비스 이용 기록, 접속 로그</p>

              <h3>3. 개인정보의 보유 및 이용기간</h3>
              <p>회원의 개인정보는 회원 탈퇴 시까지 보유 및 이용됩니다. 다만, 다음의 경우는 예외로 합니다:</p>
              <p>- 관계 법령 위반에 따른 수사, 조사 등이 진행중인 경우에는 해당 수사, 조사 종료 시까지</p>
              <p>- 서비스 이용에 따른 채권, 채무관계 잔존 시에는 해당 채권, 채무관계 정산 시까지</p>

              <h3>4. 개인정보의 제3자 제공</h3>
              <p>서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우는 예외로 합니다:</p>
              <p>- 이용자가 사전에 동의한 경우</p>
              <p>- 법령의 규정에 의거하거나, 수사 목적으로 법령에 정해진 절차와 방법에 따라 수사기관의 요구가 있는 경우</p>

              <h3>5. 개인정보의 파기</h3>
              <p>서비스는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체없이 해당 개인정보를 파기합니다.</p>

              <h3>6. 개인정보의 안전성 확보 조치</h3>
              <p>서비스는 개인정보보호법에 따라 다음과 같이 안전성 확보에 필요한 기술적/관리적 조치를 하고 있습니다:</p>
              <p>- 개인정보 암호화: GitHub OAuth 토큰 등 중요 정보는 암호화하여 저장</p>
              <p>- 접근권한 관리: 개인정보에 대한 접근권한을 최소한의 인원으로 제한</p>

              <h3>7. 이용자의 권리</h3>
              <p>이용자는 언제든지 다음의 권리를 행사할 수 있습니다:</p>
              <p>- 개인정보 열람 요구</p>
              <p>- 개인정보 정정 요구</p>
              <p>- 개인정보 삭제 요구</p>
              <p>- 개인정보 처리정지 요구</p>

              <h3>8. 개인정보 보호책임자</h3>
              <p>서비스는 개인정보 처리에 관한 업무를 총괄해서 책임지고, 개인정보 처리와 관련한 이용자의 불만처리 및 피해구제를 위하여 아래와 같이 개인정보 보호책임자를 지정하고 있습니다.</p>
              <p>개인정보 보호책임자: 서현석 (chucoding@gmail.com)</p>

              <h3>9. 개인정보처리방침의 변경</h3>
              <p>이 개인정보처리방침은 시행일로부터 적용되며, 법령 및 방침에 따른 변경내용의 추가, 삭제 및 정정이 있는 경우에는 변경사항의 시행 7일 전부터 공지사항을 통하여 고지할 것입니다.</p>
            </>
          )}
        </div>
        <DialogFooter className="px-7 py-5 border-t border-border flex justify-end max-[480px]:px-5 max-[480px]:py-4">
          <Button onClick={onClose}>
            닫기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TermsModal;
