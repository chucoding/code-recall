import React, { useState, useEffect, useCallback, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { auth, store } from '@/shared/config/firebase';
import { trackEvent } from '@/shared/config/analytics';
import { getRepositories, getBranches } from '@/features/github-sync';
import { Repository, UserRepository } from '@/shared/types';
import { LayoutTemplate, TriangleAlert, CircleCheck, RefreshCw, Lightbulb, Smartphone, ChevronRight, ChevronDown, GitBranch } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Label } from '@/shared/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

interface OnboardingProps {
  onComplete: () => void;
}

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [step, setStep] = useState<number>(1);
  /** 온보딩에서는 1개만 선택 → 저장 시 repositories: [선택한 1개] */
  const [selectedRepo, setSelectedRepo] = useState<UserRepository | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [loadingRepos, setLoadingRepos] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const [error, setError] = useState<{ type: 'repos' | 'save'; message: string } | null>(null);
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [loadingBranches, setLoadingBranches] = useState<boolean>(false);
  const selectedRepoRef = useRef<UserRepository | null>(null);
  selectedRepoRef.current = selectedRepo;

  // 리포지토리 목록 가져오기
  const fetchRepositories = useCallback(async () => {
    try {
      setLoadingRepos(true);
      setError(null);
      const repos = await getRepositories();
      setRepositories(repos);
      setLoadingRepos(false);
    } catch (error: any) {
      console.error('리포지토리 불러오기 실패:', error);
      const errorMessage = error?.response?.status === 401 || error?.response?.status === 403
        ? 'GitHub 접근 권한이 없습니다. 다시 로그인해주세요.'
        : 'GitHub 리포지토리를 불러오는데 실패했습니다.';
      
      setError({
        type: 'repos',
        message: errorMessage
      });
      setLoadingRepos(false);
    }
  }, []);

  // Step 2에 진입하면 리포지토리 목록 로드
  useEffect(() => {
    if (step === 2 && repositories.length === 0) {
      fetchRepositories();
    }
  }, [step, repositories.length, fetchRepositories]);

  const handleRepositorySelect = (repo: Repository) => {
    setSelectedRepo({ fullName: repo.full_name, url: repo.html_url });
    setIsDropdownOpen(false);
    setBranches([]);
  };

  // selectedRepo 변경 시 브랜치 목록 로드 (stale 응답 무시: 레포 전환 시 이전 요청 결과가 새 레포 브랜치를 덮어쓰지 않도록)
  useEffect(() => {
    if (!selectedRepo) {
      setBranches([]);
      setLoadingBranches(false);
      return;
    }
    const [owner, repo] = selectedRepo.fullName.split('/');
    if (!owner || !repo) return;
    const fetchFor = selectedRepo.fullName;
    setLoadingBranches(true);
    getBranches(owner, repo)
      .then((list) => {
        const stillSelected = fetchFor === selectedRepoRef.current?.fullName;
        if (stillSelected) { setBranches(list); setLoadingBranches(false); }
      })
      .catch(() => {
        const stillSelected = fetchFor === selectedRepoRef.current?.fullName;
        if (stillSelected) { setBranches([]); setLoadingBranches(false); }
      });
  }, [selectedRepo?.fullName]);

  const handleBranchChange = (value: string) => {
    if (!selectedRepo) return;
    setSelectedRepo({ ...selectedRepo, branch: value && value !== '__default__' ? value : undefined });
  };

  const handleSaveSettings = async () => {
    if (!auth.currentUser) return;
    if (!selectedRepo) {
      setError({
        type: 'save',
        message: '리포지토리를 선택해주세요.'
      });
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const userDocRef = doc(store, 'users', auth.currentUser.uid);
      const repoToSave = { fullName: selectedRepo.fullName, url: selectedRepo.url, ...(selectedRepo.branch ? { branch: selectedRepo.branch } : {}) };
      await setDoc(userDocRef, {
        repositories: [repoToSave],
        onboardingCompleted: true,
        onboardingSkipped: false,
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      trackEvent('onboarding_complete');

      // Step 3으로 이동
      setStep(3);
      
      // 2초 후 온보딩 완료
      setTimeout(() => {
        onComplete();
      }, 2000);
    } catch (error: any) {
      console.error('설정 저장 실패:', error);
      setError({
        type: 'save',
        message: error?.message || '설정 저장에 실패했습니다. 네트워크 연결을 확인해주세요.'
      });
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      handleSaveSettings();
    }
  };

  const canProceed = () => {
    if (step === 1) return true;
    if (step === 2) return !!selectedRepo;
    return false;
  };

  const handleSkipOnboarding = async () => {
    if (!window.confirm('온보딩을 건너뛰시겠습니까? 나중에 설정 페이지에서 리포지토리를 설정할 수 있습니다.')) {
      return;
    }

    try {
      if (!auth.currentUser) return;
      
      // 온보딩을 건너뛰었다는 표시를 Firestore에 저장
      const userDocRef = doc(store, 'users', auth.currentUser.uid);
      await setDoc(userDocRef, {
        onboardingCompleted: true,
        onboardingSkipped: true,
        updatedAt: new Date(),
      }, { merge: true });

      onComplete();
    } catch (error) {
      console.error('온보딩 스킵 저장 실패:', error);
      // 에러가 나도 일단 진행
      onComplete();
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen flex items-center justify-center z-[9999] p-5 overflow-y-auto">
      <div className="absolute inset-0 w-full h-full bg-bg"></div>
      
      <div className="relative bg-surface rounded-3xl pt-12 px-10 pb-10 max-w-[560px] w-full max-h-[calc(100vh-40px)] overflow-y-auto shadow-[0_20px_60px_rgba(0,0,0,0.5)] animate-slide-up m-auto border border-border max-[640px]:pt-10 max-[640px]:px-6 max-[640px]:pb-8 max-[640px]:mx-4">
        {/* Progress Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-primary/10 rounded-t-3xl overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-primary to-primary-dark transition-[width] duration-[400ms] ease-out"
            style={{ width: `${(step / 3) * 100}%` }}
          ></div>
        </div>

        {/* Step 1: 환영 */}
        {step === 1 && (
          <div className="text-center animate-fade-in">
            <h1 className="text-3xl font-bold text-text mb-4 m-0 max-[640px]:text-[28px]">환영합니다</h1>
            <p className="text-base text-text-light leading-relaxed mb-8 m-0 [&_strong]:text-primary [&_strong]:font-semibold max-[640px]:text-sm">
              <strong>CodeRecall</strong>이 GitHub 학습 기록을<br />
              플래시카드로 복습할 수 있게 도와드립니다
            </p>
            
            <div className="my-8 text-left space-y-3">
              <div className="flex items-center gap-3 p-4 bg-surface-light rounded-xl transition-colors duration-200 hover:bg-border cursor-default border border-transparent hover:border-border-medium">
                <span className="shrink-0 flex items-center justify-center text-primary" aria-hidden><RefreshCw className="w-6 h-6" /></span>
                <span className="text-sm text-text-body font-medium max-[640px]:text-[13px]">1일, 7일, 30일 전 커밋 자동 분석</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-surface-light rounded-xl transition-colors duration-200 hover:bg-border cursor-default border border-transparent hover:border-border-medium">
                <span className="shrink-0 flex items-center justify-center text-primary" aria-hidden><Lightbulb className="w-6 h-6" /></span>
                <span className="text-sm text-text-body font-medium max-[640px]:text-[13px]">AI가 핵심 내용을 질문으로 변환</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-surface-light rounded-xl transition-colors duration-200 hover:bg-border cursor-default border border-transparent hover:border-border-medium">
                <span className="shrink-0 flex items-center justify-center text-primary" aria-hidden><Smartphone className="w-6 h-6" /></span>
                <span className="text-sm text-text-body font-medium max-[640px]:text-[13px]">매일 아침 푸시 알림으로 복습</span>
              </div>
            </div>

            <Button className="w-full py-3.5 px-8 rounded-xl text-base mb-3" onClick={handleNext}>
              <span className="inline-flex items-center justify-center gap-1.5">시작하기 <ChevronRight className="w-5 h-5 shrink-0" aria-hidden /></span>
            </Button>
          </div>
        )}

        {/* Step 2: 리포지토리 선택 */}
        {step === 2 && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center" aria-hidden>
              <LayoutTemplate className="w-8 h-8 text-primary" aria-hidden />
            </div>
            <h1 className="text-3xl font-bold text-text mb-4 m-0 max-[640px]:text-[28px]">리포지토리 선택</h1>
            <p className="text-base text-text-light leading-relaxed mb-8 m-0 max-[640px]:text-sm">
              학습하고 싶은 GitHub 리포지토리를 선택해주세요
            </p>

            {/* 에러 메시지 */}
            {error && (
              <Alert variant="destructive" className="mb-6 animate-[errorSlide_0.3s_ease-out]">
                <TriangleAlert className="size-5 shrink-0" aria-hidden />
                <div className="flex-1">
                  <AlertDescription className="mb-4">{error.message}</AlertDescription>
                  <Button variant="outline" size="sm" className="min-w-[150px]" onClick={handleSkipOnboarding}>
                    나중에 설정하기
                  </Button>
                </div>
              </Alert>
            )}

            <div className="my-8 text-left">
              {/* 리포지토리 선택 */}
              <div>
                <label className="block text-sm font-semibold text-text mb-2">
                  리포지토리 *
                  {loadingRepos && <span className="font-normal text-primary text-xs"> (로딩 중...)</span>}
                </label>
                <div className="relative w-full">
                  <button
                    className="w-full p-3 px-4 bg-surface-light border-2 border-border rounded-xl text-sm text-left cursor-pointer transition-all duration-200 flex justify-between items-center text-text hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                    disabled={loadingRepos}
                  >
                    <span className={selectedRepo ? "" : "text-text-muted"}>
                      {selectedRepo ? selectedRepo.fullName : "리포지토리를 선택하세요"}
                    </span>
                    <ChevronDown className="w-4 h-4 text-text-light shrink-0 transition-transform duration-200" aria-hidden />
                  </button>
                  
                  {isDropdownOpen && (
                    <div className="absolute top-[calc(100%+4px)] left-0 right-0 bg-surface border-2 border-border rounded-xl max-h-[200px] overflow-y-auto shadow-[0_10px_25px_rgba(0,0,0,0.4)] z-[100] animate-[dropdownSlide_0.2s_ease-out]">
                      {repositories.length === 0 ? (
                        <div className="p-3 px-4 cursor-not-allowed text-sm text-text-muted hover:bg-transparent">
                          리포지토리가 없습니다
                        </div>
                      ) : (
                        repositories.map((repo) => (
                          <div
                            key={repo.id}
                            className="p-3 px-4 cursor-pointer transition-colors duration-200 text-sm hover:bg-surface-light"
                            onClick={() => handleRepositorySelect(repo)}
                          >
                            <div className="font-semibold text-text mb-1">{repo.full_name}</div>
                            {repo.description && (
                              <div className="text-xs text-text-light overflow-hidden text-ellipsis whitespace-nowrap">{repo.description}</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
              {/* 브랜치 선택 (선택사항) */}
              <div className="mt-4">
                <Label htmlFor="branch-onboarding" className="block text-sm font-semibold text-text mb-2 flex items-center gap-1.5">
                  <GitBranch className="w-4 h-4 shrink-0" aria-hidden />
                  브랜치 (선택사항)
                </Label>
                <Select
                  value={selectedRepo?.branch || '__default__'}
                  onValueChange={handleBranchChange}
                  disabled={!selectedRepo || loadingBranches || saving}
                >
                  <SelectTrigger id="branch-onboarding" className="w-full">
                    <SelectValue placeholder={selectedRepo ? (loadingBranches ? '로딩 중...' : '기본 브랜치 (main)') : '리포지토리를 먼저 선택하세요'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__default__">기본 브랜치 (main)</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.name} value={b.name}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              className="w-full py-3.5 px-8 rounded-xl text-base mb-3"
              onClick={handleNext}
              disabled={!canProceed() || saving}
            >
              {saving ? '저장 중...' : (<span className="inline-flex items-center justify-center gap-1.5">완료하기 <ChevronRight className="w-5 h-5 shrink-0" aria-hidden /></span>)}
            </Button>

            <Button
              variant="outline"
              className="w-full py-3.5 px-8 rounded-xl text-base border-2"
              onClick={handleSkipOnboarding}
              disabled={saving}
            >
              나중에 설정하기
            </Button>
          </div>
        )}

        {/* Step 3: 완료 */}
        {step === 3 && (
          <div className="text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-6 rounded-2xl bg-primary/10 flex items-center justify-center animate-[successPulse_0.6s_ease-out]" aria-hidden>
              <CircleCheck className="w-8 h-8 text-primary" aria-hidden />
            </div>
            <h1 className="text-3xl font-bold text-text mb-4 m-0 max-[640px]:text-[28px]">준비 완료</h1>
            <p className="text-base text-text-light leading-relaxed mb-8 m-0 max-[640px]:text-sm">
              플래시카드를 생성하고 있습니다...<br />
              잠시만 기다려주세요
            </p>
            
            <div className="w-[60px] h-[60px] border-4 border-primary/20 border-t-primary rounded-full animate-spin mt-8 mx-auto"></div>
          </div>
        )}

        {/* Step Indicator */}
        <div className="flex justify-center gap-2 mt-8">
          <div className={`h-2 rounded-full transition-all duration-300 ${step >= 1 ? 'w-6 rounded bg-gradient-to-br from-primary to-primary-dark' : 'w-2 bg-border'}`}></div>
          <div className={`h-2 rounded-full transition-all duration-300 ${step >= 2 ? 'w-6 rounded bg-gradient-to-br from-primary to-primary-dark' : 'w-2 bg-border'}`}></div>
          <div className={`h-2 rounded-full transition-all duration-300 ${step >= 3 ? 'w-6 rounded bg-gradient-to-br from-primary to-primary-dark' : 'w-2 bg-border'}`}></div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
